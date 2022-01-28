AFRAME.registerComponent('instanced-mesh', {
  schema: {
      capacity:   {type: 'number', default: 100},
      fcradius:   {type: 'number', default: 0},
      fccenter:   {type: 'vec3'},
      positioning: {type: 'string', default: "local"},
      debug:      {type: 'boolean', default: false},
      layers:     {type: 'string', default: ""}
  },

  init: function () {
    this.capacity = this.data.capacity;
    this.members = 0;
    this.debug = this.data.debug;
    this.meshLoaded = false;
    this.texturesLoaded = 0;
    this.eventQueue = [];

    // Bounding sphere used for frustrum culling
    this.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);

    // Other objects used in frame of reference calculations.
    // Only used for working - these don't contain any persistent meaingful data.
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.scale = new THREE.Vector3();

    // List of members flagged for removal.  Used to efficiently delete
    // multiple entries.
    this.membersToRemove = [];

    // Ordered list of member entity IDs.  This matches order in the Instanced
    // Mesh matrix list.  Needed so that we can delete elements on request.
    // I have not thought very deeply about performance of an array vs. e.g. an
    // object used as a dictionary.
    // We have 2 requirements in tension:
    // A - for modifications, we want a fast lookup using the entity ID.
    // B - for removals, we want to be able to remove an item and efficiently
    //   update all the later indices, as we renumber to fill in the gap.
    //
    // While I have not tested comparative performance, we can easily meet A and
    // B using an Array using findIndex (A) and splice (B).
    // A dictionary-style object would be great for A, but harder for B, I suspect.

    this.orderedMembersList = [];

    this.listeners = {
      memberAdded: this.memberAdded.bind(this),
      memberModified: this.memberModified.bind(this),
      memberRemoved: this.memberRemoved.bind(this),
    };
    this.attachEventListeners();

    // Used for working, to save re-allocations.
    this.matrix = new THREE.Matrix4();
    this.debugMatrix = new THREE.Matrix4();
    this.componentMatrix = new THREE.Matrix4();

  },

  attachEventListeners: function() {
    this.el.addEventListener('memberAdded', this.listeners.memberAdded, false);
    this.el.addEventListener('memberModified', this.listeners.memberModified, false);
    this.el.addEventListener('memberRemoved', this.listeners.memberRemoved, false);
  },

  update: function () {

    // set configured positioning mode
    switch (this.data.positioning) {
      case "local":
        this.localPositioning = true;
        break;

      case "world":
        this.localPositioning = false;
        break;

      default:
        console.log(`Unexpected value for 'positioning' attribute: ${this.data.positioning}`);
        console.log(`Defaulting to "local" positioning`);
        this.localPositioning = true;
        break;
    }

    // Possible we are waiting for a GLTF model to load.  If so, defer processing...
    // !! We have a bug where using a geometry where that is specified on the
    // object *after* instanced-mesh.  This component gets initialized first but there
    // is no "model-loaded" event.  What's the equivalent?
    // For now, solution is to always specify instanced-mesh *after* geometry.
    var originalMesh = this.el.getObject3D('mesh')
    if (!originalMesh) {
        this.el.addEventListener('model-loaded', e => {
        this.update.call(this, this.data)
        })
        return;
    }

    // If there are textures to be loaded, wait for them all to load before
    // proceeding.
    if (this.el.components.material &&
        this.el.components.material.shader &&
        this.el.components.material.shader.materialSrcs) {

      this.countTexturesToLoad();

      if (this.texturesToLoad !== this.texturesLoaded) {

        // still textures to load.
        this.el.addEventListener("materialtextureloaded", (e) => {
          this.texturesLoaded++;
          if (this.texturesToLoad === this.texturesLoaded) {
            // All textures loaded - proceed.
            this.update.call(this, this.data)
          }
        })
        return;
      }
    }

    if (originalMesh.count > 0) {
      // we already have a set of instanced meshes in place.
      console.assert(originalMesh === this.instancedMeshes[0])

      // but do they have enough capacity?
      if (originalMesh.instanceMatrix.count < this.data.capacity) {
        // resize instanced meshes
        this.increaseInstancedMeshCapacity();
      }
      else {
        // We can continue using existing instanced meshes.
      }
    }
    else {
      // No instanced Meshes yet in place.  Analyze original mesh to see how to
      // build the instanced Meshes.
      this.meshNodes = this.constructMeshNodes(originalMesh);

      this.instancedMeshes = [];
      this.componentMatrices = [];

      this.meshNodes.forEach((node, index) => {
        var instancedMesh = new THREE.InstancedMesh(node.geometry,
                                                    node.material,
                                                    this.data.capacity);

        // For each instanced mesh required, we store off both the instanced mesh
        // itself. and the transform matrix for the component of the model that
        // it represents.
        this.instancedMeshes.push(instancedMesh);
        this.componentMatrices.push(node.matrixWorld)
      });
    }

    // some other details that may need to be updated on the instanced meshes...
    this.updateFrustrumCulling();
    this.updateLayers();

    // Add all the instanced meshes as children of the object3D, and remove
    // the original mesh.
    this.instancedMeshes.forEach(mesh => {
      this.el.object3D.add(mesh);
    });
    this.el.object3D.remove(originalMesh);

    // set the Object3D Map to point to the first instanced mesh.
    this.el.setObject3D('mesh', this.instancedMeshes[0]);

    this.meshLoaded = true;

    // process any events pending on this mesh.
    this.processQueuedEvents();
  },

  countTexturesToLoad: function () {

    const material = this.el.components.material
    const shader = material.shader
    const textures = shader.materialSrcs

    // start with materialSrcs
    this.texturesToLoad = Object.keys(shader.materialSrcs).length;

    // add in other shader textures that may be needed.
    this.texturesToLoad += shader.ambientOcclusionTextureSrc ? 1 : 0;
    this.texturesToLoad += shader.displacementTextureSrc ? 1 : 0;
    this.texturesToLoad += shader.normalTextureSrc ? 1 : 0;
    this.texturesToLoad += (shader.isLoadingEnvMap ||
                            material.material.envMap) ? 1 : 0;
  },

  increaseInstancedMeshCapacity: function() {

    newMeshes = [];

    this.meshNodes.forEach((node, index) => {
      const oldMesh = this.instancedMeshes[index];
      var newMesh = new THREE.InstancedMesh(node.geometry,
                                            node.material,
                                            this.data.capacity);
      newMeshes.push(newMesh);
      for (ii = 0; ii < Math.min(oldMesh.count, this.data.capacity); ii ++ ) {
        oldMesh.getMatrixAt(ii, this.matrix)
        newMesh.setMatrixAt(ii, this.matrix);
      }

      this.el.object3D.add(newMesh);
      this.el.object3D.remove(oldMesh);

      // THREE.js docs say we should also all this when finished with an Instanced Mesh.
      // but doing so is causing an error.
      // So maybe we have a small leak as a result of not doing this, but I don't know how to fix...
      // oldMesh.dispose();
    });

    this.instancedMeshes = newMeshes;
    this.el.setObject3D('mesh', this.instancedMeshes[0]);
  },

  updateFrustrumCulling: function() {

    // Set up frustrum culling if configured.
    // This uses a separate "boundingSphere" object that represents the
    // maximum extent of all members of the mesh.
    // If one is specified, we us this for frustrum culling.  If not, we don't
    // use frustrum culling at all for this mesh.
    if (this.data.fcradius > 0) {
      this.boundingSphere.center.copy(this.data.fccenter);
      this.boundingSphere.radius = this.data.fcradius;
      this.instancedMeshes.forEach(mesh => {
        mesh.geometry.boundingSphere = this.boundingSphere;
        mesh.frustumCulled = true;
      });
    }
    else
    {
      this.instancedMeshes.forEach(mesh => {
        mesh.frustumCulled = false;
      });
    }
  },

  updateLayers: function() {

    if (this.data.layers !== "") {
      const layerNumbers = this.data.layers.split(",").map(Number);
      // Reset
      this.instancedMeshes.forEach(mesh => {
        mesh.layers.disableAll();
      });

      // Apply
      for (let num of layerNumbers) {
        this.instancedMeshes.forEach(mesh => {
          mesh.layers.enable(num);
        });
      }
    }
  },

  // This constructs our inetrnal view of the properties of the original Mesh
  // that we need to capture for instancing, namely:
  // - geometry of each component
  // - material(s) of each component
  // - transforms of each component.
  constructMeshNodes: function(originalMesh) {
    meshNodes  = [];

    originalMesh.updateMatrixWorld();
    originalMesh.traverse(function(node) {

      var material;
      var geometry;

      if(node.type != "Mesh") return;
      geometry = node.geometry;

      // material can be an array of materials.  We want the whole array.
      // Why clone?  AFrame-InstancedMesh says:
      // this component creates a .clone() of parent material because of a known
      // threejs limitation.
      // I don't yet have a reference for what that threejs limittation is, and
      // whether it still applies.
      if (Array.isArray(node.material)) {
        material = [];
        node.material.forEach(item => material.push(item.clone()));
      }
      else
      {
        material = node.material.clone();
      }

      node.updateMatrixWorld();
      this.matrix = node.matrixWorld.clone();
      this.matrix.premultiply(originalMesh.matrixWorld.invert());

      meshNodes.push({'geometry' : geometry,
                      'material' : material,
                      'matrixWorld': this.matrix});
    })

    return meshNodes;
  },

  memberAdded: function(event) {

    if (!this.meshLoaded) {
      // Mesh not yet loaded, so instanced mesh not yet created.
      // Queue this event up for later processing.
      this.queueEvent(event)
      return;
    }

    const memberID = event.detail.member.id;
    var index;

    // First, choose the index for the new member.
    // 2 possibilities...
    // 1. If there are members pending deletion, just overwrite one of them.
    if (this.membersToRemove.length > 0) {

      // Grab the index, and remove this index from the list of pending deletions.
      const id = this.membersToRemove[0];
      index = this.orderedMembersList.findIndex(x => (x == id));

      this.membersToRemove.splice(0, 1);
      this.orderedMembersList[index] = memberID;
    }
    // 2. If nothing is  pending deletion, so just add to the end of the list as
    //    a new member.
    else
    {
      if (this.members > this.capacity) {
        // Don't go over capacity.
        console.warn(`Member not added to mesh ${this.el.id}.  Exceeded configured capacity of ${this.capacity}`)
        return;
      }

      index = this.members;
      this.members++;
      this.orderedMembersList.push(memberID);
    }

    this.updateMatricesFromMemberObject(event.detail.member.object3D, index);

    // Diags: Dump full matrix of x/y positions:
    //for (var jj = 0; jj < this.members; jj++) {
      //console.log(`x: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 12]}, y: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 13]}`);
    //}

    this.instancedMeshes.forEach(mesh => {
      mesh.count = this.members;
      mesh.instanceMatrix.needsUpdate = true;
    });
  },

  // For a given index position, across all instanced meshes, update the
  // matrices to match the transform of the member object
  // (provided in the object3D)
  updateMatricesFromMemberObject(object3D, index) {

    this.matrix = this.matrixFromMemberObject(object3D);

    this.instancedMeshes.forEach((mesh, componentIndex) => {

      if (this.debug) {
        //console.log(`Modifying member ${id} at position ${index}`);
        console.log(`Setting matrix for component index ${componentIndex}`)

        mesh.getMatrixAt(index, this.debugMatrix);

        var position = this.position;
        position.setFromMatrixPosition(this.debugMatrix);
        console.log(`Old position:${position.x} ${position.y} ${position.z}`);
        position.setFromMatrixPosition(object3D.matrix);
        console.log(`New position:${position.x} ${position.y} ${position.z}`);
      }

      this.componentMatrix = this.matrix.clone();

      this.componentMatrix.multiply(this.componentMatrices[componentIndex]);
      mesh.setMatrixAt(index, this.componentMatrix);

      mesh.instanceMatrix.needsUpdate = true;
    });
  },

  // Get the matrix to add to an instanced mesh from an object 3D
  // allowing for positioning style (local or world)
  matrixFromMemberObject: function(object3D) {

    // matrix used for working...
    const matrix = this.matrix;

    if (this.localPositioning) {

      // Pull object3D details to construct matrix.  Note that the
      // matrix itself can't be relied upon to have been correctly intialized,
      // which is why we don't use it directly.
      // !! 24/7/21 - I'd like to understand this better...
      //              could be a lot slicker if we could assume object3D matrix
      //              is fully initialized...
      matrix.compose(object3D.position,
                     object3D.quaternion,
                     object3D.scale);
    }
    else
    {
      object3D.getWorldPosition(this.position);
      object3D.getWorldQuaternion(this.quaternion);
      object3D.getWorldScale(this.scale);

      // We now have world co-ordinates of the mesh member.
      // Just need to transform into the frame of reference of the instanced
      // mesh itself.
      // As follows:
      // Make sure parent MatrixWorld is up to date.
      // Take it's inverse, and pre-multiply by it.
      // This way, when the parent MatrixWorld is applied to the object
      // it will end up back where we wanted it.
      this.el.object3D.parent.updateMatrixWorld();
      var parentMatrix = this.el.object3D.parent.matrixWorld.invert()

      matrix.compose(this.position, this.quaternion, this.scale);
      matrix.premultiply(parentMatrix);
    }

    return matrix;
  },

  memberModified: function(event) {

    if (!this.meshLoaded) {
      // Mesh not yet loaded, so instanced mesh not yet created.
      // Queue this event up for later processing.
      this.queueEvent(event)
      return;
    }

    // Not yet thought about transitations between frames of reference
    // Just assume all in same FOR for now..
    const id = event.detail.member.id;
    const index = this.orderedMembersList.findIndex(x => (x == id));

    if (index == -1) {
      console.error(`Member ${id} not found for modification`)
    }

    this.updateMatricesFromMemberObject(event.detail.member.object3D, index);
  },

  memberRemoved: function(event) {

    if (!this.meshLoaded) {
      // Mesh not yet loaded, so instanced mesh not yet created.
      // Queue this event up for later processing.
      this.queueEvent(event)
      return;
    }

    // If multiple members are removed at once, it's inefficient to process
    // them individually.

    // So we just mark a member as needing removal, and do the actual clean-up
    // at the next tick, by which time we may have collected a number of
    // deletions to handle all together.
    //console.log("Removing mesh member with ID:" + event.detail.member.id);
    this.membersToRemove.push(event.detail.member.id);
    if (this.debug) {
      console.log(`Member ${event.detail.member.id} queued up for removal`);
    }
  },

  queueEvent: function (event) {
    this.eventQueue.push(event);
  },

  processQueuedEvents: function () {
    this.eventQueue.forEach((item) => {
      switch (item.type) {

        case "memberAdded":
          this.memberAdded(item);
          break;

        case "memberModified":
          this.memberModified(item);
          break;

        case "memberRemoved":
          this.memberRemoved(item);
          break;

        default:
          console.log(`Unexpected Event Type: ${item.type}`);
          break;
      }

      // Processed all queued events, so clear the queue.
      this.eventQueue = [];
    });
  },

  tick: function (time, timeDelta) {

    if (this.membersToRemove.length > 0) {
      // We have members to Remove.
      // We need to iterate through all members, as those that aren't removed
      // still need to be shuffled up.
      var removed = 0;


      for (var ii = 0; ii < this.members; ii++) {
        // Check whether this one is to be removed (taking into account
        // index shuffling that has already taken place...)
        // If so, increment the amount we are shuffling up by, which will
        // lead to this entry being overwritten.

        var matrixCursor = ii;
        var membersCursor = ii - removed;

        if (this.membersToRemove.includes(this.orderedMembersList[membersCursor])) {
          //console.log(`Item to remove: ${this.orderedMembersList[membersCursor]} at position ${matrixCursor}`)
          if (this.debug) {
            console.log(`Removing member ${this.orderedMembersList[membersCursor]} at position ${membersCursor}`);
          }
          this.orderedMembersList.splice(membersCursor, 1);
          removed++;
        }
        // Now do the shuffle up.
        // If we just incremented the count of removed elements, the current
        // element will get overwritten.
        // Else items will just get shuffled up.
        if (removed > 0) {
          //console.log(`copying cell from ${matrixCursor + 1} to ${matrixCursor - removed + 1}`);

          if (matrixCursor + 1 < this.members) {

            this.instancedMeshes.forEach(mesh => {

              mesh.getMatrixAt(matrixCursor + 1, this.matrix);
              mesh.setMatrixAt(matrixCursor - removed + 1, this.matrix);
            });
          }
        }
      }
      this.members -= removed;

      this.instancedMeshes.forEach(mesh => {
        mesh.count = this.members;
        mesh.instanceMatrix.needsUpdate = true;
      });

      // No further pending removals.
      this.membersToRemove = [];

      // Diags: Dump full matrix of x/y positions:
      //for (var jj = 0; jj < this.members; jj++) {
        //console.log(`x: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 12]}, y: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 13]}`);
      //}

      console.log("Removals done");
    }
  }

});

AFRAME.registerComponent('instanced-mesh-member', {
  schema: {
        mesh:       {type: 'selector'},
        debug:      {type: 'boolean', default: false}
  },

  init: function() {
    this.index = -1;
    this.added = false;
    this.debug = this.data.debug;
    this.listeners = {
      object3DUpdated: this.object3DUpdated.bind(this),
    };
    this.attachEventListeners();

    // Some state we track, to help make the right updates to the Instanced Mesh.
    this.visible = this.el.object3D.visible;
    this.matrix = this.el.object3D.matrix.clone();
  },

  update: function () {
    // look for changes to be mirrored to the Mesh.
    if (this.visible) {
      // Object was previously visible.  But might not be any more...
      if (!this.el.object3D.visible) {
        if (this.debug) {
          console.log("Removed (v):" + this.el.id);
        }
        this.data.mesh.emit('memberRemoved', {member: this.el});
        this.visible = false;
      }
      else {
        // Object was & is visible.  Check for other updates that need to be
        // mirrored to the Mesh.
        // Basically just the localMatrix at this stage...
        // (we'll need to revisit when we support multiple frames of reference...)
        if (!this.matrix.equals(this.el.object3D.matrix)) {
          // there's been some change to position, orientation or scale, so
          // mirror it.
          if (this.debug) {
            console.log("Modified:" + this.el.id);
          }
          this.data.mesh.emit('memberModified', {'member': this.el});
          this.matrix.copy(this.el.object3D.matrix);
        }
      }
    }
    else {
      // Object not previously visible.  But might have just become...
      if (this.el.object3D.visible) {
        if (this.debug) {
          console.log("Added (v):" + this.el.id);
        }
        this.data.mesh.emit('memberAdded', {member: this.el});
        this.matrix.copy(this.el.object3D.matrix);
        this.visible = true;
        this.added = true;
      }
    }
  },

  play: function () {
    // We hold off adding the member to the mesh until this point
    // because prior to this (e.g. on init or update), the scale properties of
    // object3D don't seem to have been set to the correct values.
    if ((!this.added) &&
        (this.el.object3D.visible)) {
      if (this.debug) {
        //console.log(`Position: ${this.el.object3D.position.x} ${this.el.object3D.position.y}`)
        console.log("Added:" + this.el.id);
      }
      this.data.mesh.emit('memberAdded', {member: this.el});
      this.matrix.copy(this.el.object3D.matrix);
      this.added = true;
    }
  },

  attachEventListeners: function() {
    this.el.addEventListener('object3DUpdated', this.listeners.object3DUpdated, false);
  },

  remove: function() {
    if (this.debug) {
      console.log("Removed:" + this.el.id);
    }
    this.data.mesh.emit("memberRemoved", {'member': this.el});
  },

  // This should be invoked whenever the Object3D is updated.
  // Mirror any changes across to the parent instance mesh.
  // IMPORTANT: make sure matrix is up to date with any applied
  // changes, before making the updates to the Instanced Mesh.
  object3DUpdated: function(event) {
    if (this.debug) {
      console.log("Updated:" + this.el.id);
    }
    this.el.object3D.updateMatrix();
    this.update();
  }

});
