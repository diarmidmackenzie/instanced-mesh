AFRAME.registerComponent('instanced-mesh', {
  schema: {
      capacity:   {type: 'number'}

  },

  init: function () {
    this.capacity = this.data.capacity;
    this.members = 0;

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
  },

  attachEventListeners: function() {
    this.el.addEventListener('memberAdded', this.listeners.memberAdded, false);
    this.el.addEventListener('memberModified', this.listeners.memberModified, false);
    this.el.addEventListener('memberRemoved', this.listeners.memberRemoved, false);
  },

  update: function () {

    var material;
    var geometry;

    // Code from A-Frame instancedmesh.  Possibility we are waiting for a
    // GLTF model to load.
    // !! We have a bug where using a geometry where that is specified on the
    // object *after* instanced-mesh.  This gets initialized first but there
    // is no "model-loaded" event.  What's the equivalent?
    var mesh = this.el.getObject3D('mesh')
    if (!mesh) {
        this.el.addEventListener('model-loaded', e => {
        this.update.call(this, this.data)
        })
        return;
    }

    // The mesh may be a regular Mesh (on creation) or a previously created
    // instancedMesh (on update).
    // Either way, we copy required properties across to a new InstancedMesh,
    // and replace the old one with the new one.

    // material can be an array of materials.  We want the whole array.
    // Why clone?  AFrame-InstancedMesh says:
    // this component creates a .clone() of parent material because of a known
    // threejs limitation.
    // I don't yet have a reference for what that threejs limittation is, and
    // whether it still applies.
    if (Array.isArray(mesh.material)) {
      material = [];
      mesh.material.forEach(item => material.push(item.clone()));
    }
    else
    {
      material = mesh.material.clone();
    }

    // Find the geometry.  Code from A-Frame instancedmesh
    // I don't really understand why this is the best way to get the geometry
    // but it seems to work ok...
    mesh.traverse(function(node) {
        if(node.type != "Mesh") return;
        geometry = node.geometry;
    })


    this.instancedMesh = new THREE.InstancedMesh(geometry,
                                                 material,
                                                 this.data.capacity);
    // If the old mesh contains instances, we should copy them across.
    // if new capacity is less than old capacity, we'll lose some items.
    var ii = 0;
    if (mesh.count > 0)
    {
      // An existing InstancedMesh, with some members.
      for (ii = 0; ii < Math.min(mesh.count, this.data.capacity); ii ++ ) {
          this.instancedMesh.setMatrixAt(ii, mesh.getMatrixAt(ii));
      }

      //!! Assumption this matches our internal view of members.
      // We ought to check & warn if not...
    }
    this.members = ii;

    // Copied from A-Frame instancedmesh.  I don't understand why this is
    // added as a child of Object3D...
    // rather than e.g. this.el.setObject3D('mesh', this.instancedMesh);
    this.el.object3D.add(this.instancedMesh);
    this.el.object3D.remove(mesh);
  },

  memberAdded: function(event) {
    // Not yet thought about transitations between frames of reference
    // Just assume all in same Frame of Reference for now..

    memberID = event.detail.member.id;

    // First, choose the index for the new member.
    // 2 possibilities...
    // 1. If there are members pending deletion, just overwrite one of them.
    if (this.membersToRemove.length > 0) {

      // Grab the index, and remove this index from the list of pending deletions.
      index = this.membersToRemove[0];
      this.membersToRemove.splice(0, 1);
      this.orderedMembersList[index] = memberID;
    }
    // 2. If nothing is  pending deletion, so just add to the end of the list as
    //    a new member.
    else
    {
      index = this.members;
      this.members++;
      this.orderedMembersList.push(memberID);

      if (this.members > this.capacity) {
        // Don't go over capacity.
        console.warn(`Member not added to mesh ${this.el.id}.  Exceeded configured capacity of ${tis.capacity}`)
        return;
      }
    }

    // Pull object3D details to construct matrix.  Note that the
    // matrix itself can't be relied upon to have been correctly intialized,
    // which is why we don't use it directly.
    var position = event.detail.member.object3D.position
    var quaternion = event.detail.member.object3D.quaternion
    var scale = event.detail.member.object3D.scale
    this.matrix.compose(position, quaternion, scale);
    //console.log(`Mesh adding... Position: ${position.x} ${position.y}`)

    this.instancedMesh.setMatrixAt(index, this.matrix);

    // Diags: Dump full matrix of x/y positions:
    for (var jj = 0; jj < this.members; jj++) {
      //console.log(`x: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 12]}, y: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 13]}`);
    }

    this.instancedMesh.count = this.members;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  },

  memberModified: function(event) {
    // Not yet thought about transitations between frames of reference
    // Just assume all in same FOR for now..
    const id = event.detail.member.id;

    const index = this.orderedMembersList.findIndex(x => (x == id));
    this.instancedMesh.setMatrixAt(index, event.detail.member.object3D.matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  },

  memberRemoved: function(event) {

    // If multiple members are removed at once, it's inefficient to process
    // them individually.

    // So we just mark a member as needing removal, and do the actual clean-up
    // at the next tick, by which time we may have collected a number of
    // deletions to handle all together.
    //console.log("Removing mesh member with ID:" + event.detail.member.id);
    this.membersToRemove.push(event.detail.member.id);
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
            this.instancedMesh.getMatrixAt(matrixCursor + 1, this.matrix);
            this.instancedMesh.setMatrixAt(matrixCursor - removed + 1, this.matrix);
          }
        }

      }
      this.members -= removed;
      this.instancedMesh.count = this.members;
      this.instancedMesh.instanceMatrix.needsUpdate = true;

      // No further pending removals.
      this.membersToRemove = [];

      // Diags: Dump full matrix of x/y positions:
      for (var jj = 0; jj < this.members; jj++) {
        //console.log(`x: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 12]}, y: ${this.instancedMesh.instanceMatrix.array[jj * 16 + 13]}`);
      }

      //console.log("Removals done");
    }
  }

});

AFRAME.registerComponent('instanced-mesh-member', {
  schema: {
        mesh:       {type: 'selector'}
  },

  init: function() {
    this.index = -1;
    this.added = false;
    this.listeners = {
      object3DUpdated: this.object3DUpdated.bind(this),
    };
    this.attachEventListeners();
  },

  play: function () {
    // We hold off adding the member to the mesh until this point
    // because prior to this (e.g. on init or update), the scale properties of
    // object3D don't seem to have been set to the correct values.
    if (!this.added) {
      //console.log(`Position: ${this.el.object3D.position.x} ${this.el.object3D.position.y}`)
      this.data.mesh.emit('memberAdded', {member: this.el});
      this.added = true;
    }
  },

  attachEventListeners: function() {
    this.el.addEventListener('memberRegistered', this.listeners.memberRegistered, false);
    this.el.addEventListener('object3DUpdated', this.listeners.object3DUpdated, false);
    this.el.addEventListener('memberRemoved', this.listeners.memberRemoved, false);
  },

  remove: function() {

    this.data.mesh.emit("memberRemoved", {'member': this.el});
  },

  // This should be invoked whenever the Object3D is updated.
  // Mirror any changes across to the parent instance mesh.
  object3DUpdated: function(event) {
    this.data.mesh.emit('memberModified', {'member': this.el});
  }

});
