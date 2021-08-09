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
    this.eventQueue = [];

    // Bounding sphere used for frustrum culling
    this.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);

    // Other objects used in frame of reference calculations.
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
    this.componentMatrix = new THREE.Matrix4();
    this.scaleVector = new THREE.Vector3();
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

    // Code from A-Frame instancedmesh.  Possibility we are waiting for a
    // GLTF model to load.
    // !! We have a bug where using a geometry where that is specified on the
    // object *after* instanced-mesh.  This gets initialized first but there
    // is no "model-loaded" event.  What's the equivalent?
    var originalMesh = this.el.getObject3D('mesh')
    if (!originalMesh) {
        this.el.addEventListener('model-loaded', e => {
        this.update.call(this, this.data)
        })
        return;
    }

    // The mesh may be a regular Mesh (on creation) or a previously created
    // instancedMesh (on update).
    // Either way, we copy required properties across to a new InstancedMesh,
    // and replace the old one with the new one.


    // Find the geometry and materials on the mesh node(s).
    // Note that some GLTF models have multiple Mesh nodes.
    // In this case, we need a THREE.js InstancedMesh for each of them.

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

    this.instancedMeshes = [];
    this.componentMatrices = [];
    meshNodes.forEach((node, index) => {      
      var instancedMesh = new THREE.InstancedMesh(node.geometry,
                                                  node.material,
                                                  this.data.capacity);
      this.instancedMeshes.push(instancedMesh);
      this.componentMatrices.push(node.matrixWorld)

    });

    // If the old mesh contains instances, we should copy them across.
    // if new capacity is less than old capacity, we'll lose some items.
    var ii = 0;
    if (originalMesh.count > 0)
    {
      // An existing InstancedMesh, with some members.
      for (ii = 0; ii < Math.min(mesh.count, this.data.capacity); ii ++ ) {
          this.instancedMeshes.forEach(mesh => {
            mesh.setMatrixAt(ii, mesh.getMatrixAt(ii));
          });
      }

      //!! Assumption this matches our internal view of members.
      // We ought to check & warn if not...
    }
    this.members = ii;
    this.instancedMeshes.forEach(mesh => {
      mesh.count = ii;
    });


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

    // Copied from A-Frame instancedmesh.  I don't understand why this is
    // added as a child of Object3D...
    // rather than e.g. this.el.setObject3D('mesh', this.instancedMesh);
    this.instancedMeshes.forEach(mesh => {
      this.el.object3D.add(mesh);
    });
    this.el.object3D.remove(originalMesh);

    this.meshLoaded = true;
    this.processQueuedEvents();
  },

  memberAdded: function(event) {
    // Not yet thought about transitations between frames of reference
    // Just assume all in same Frame of Reference for now..

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

    this.matrixFromMemberObject(event.detail.member.object3D,
                                this.matrix)
    this.instancedMeshes.forEach((mesh, componentIndex) => {
      console.log(`Setting matrix for component index ${componentIndex}`)
      this.componentMatrix = this.matrix.clone();
      this.scaleVector.setFromMatrixScale(this.matrix)
      console.log(`Scale before model adjustment: ${this.scaleVector.x} ${this.scaleVector.y} ${this.scaleVector.z}`)
      this.componentMatrix.multiply(this.componentMatrices[componentIndex]);
      console.log(`Scale after model adjustment: ${this.scaleVector.x} ${this.scaleVector.y} ${this.scaleVector.z}`)
      mesh.setMatrixAt(index, this.componentMatrix);
    });

    // Diags: Dump full matrix of x/y positions:
    //for (var jj = 0; jj < this.members; jj++) {
      //console.log(`x: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 12]}, y: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 13]}`);
    //}

    this.instancedMeshes.forEach(mesh => {
      mesh.count = this.members;
      mesh.instanceMatrix.needsUpdate = true;
    });
  },

  // Get the matrix to add to an instanced mesh from an object 3D
  // allowing for positioning style (local or world)
  //
  // Uses a closure to make variables needed in the global case available
  // efficiently
  matrixFromMemberObject: function(object3D, matrix) {

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

    this.instancedMeshes.forEach(mesh => {

      if (this.debug) {
        console.log(`Modifying member ${id} at position ${index}`);
        mesh.getMatrixAt(index, this.matrix);

        var position = new THREE.Vector3();
        position.setFromMatrixPosition(this.matrix);
        console.log(`Old position:${position.x} ${position.y} ${position.z}`);
        position.setFromMatrixPosition(event.detail.member.object3D.matrix);
        console.log(`New position:${position.x} ${position.y} ${position.z}`);
      }

      mesh.setMatrixAt(index, event.detail.member.object3D.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    });
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

      this.instancedMeshes.forEach(mesh => {

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

              mesh.getMatrixAt(matrixCursor + 1, this.matrix);
              mesh.setMatrixAt(matrixCursor - removed + 1, this.matrix);
            }
          }

        }
        this.members -= removed;
        mesh.count = this.members;
        mesh.instanceMatrix.needsUpdate = true;

        // No further pending removals.
        this.membersToRemove = [];

        // Diags: Dump full matrix of x/y positions:
        //for (var jj = 0; jj < this.members; jj++) {
          //console.log(`x: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 12]}, y: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 13]}`);
        //}
      });

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
