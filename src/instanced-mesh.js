AFRAME.registerComponent('instanced-mesh', {
  schema: {
      capacity:   {type: 'number'}

  },

  init: function () {
    this.capacity = this.data.capacity;
    this.members = 0;
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
    // Just assume all in same FOR for now..
    index = this.members;


    var position = event.detail.member.object3D.position
    var quaternion = event.detail.member.object3D.quaternion
    var scale = event.detail.member.object3D.scale
    this.matrix.compose( position, quaternion, scale );

    this.instancedMesh.setMatrixAt(index, this.matrix);
    event.detail.member.emit("memberRegistered", {index: index});
    this.members++;
    this.instancedMesh.count = this.members;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  },

  memberModified: function(event) {
    // Not yet thought about transitations between frames of reference
    // Just assume all in same FOR for now..
    this.instancedMesh.setMatrixAt(event.detail.index, event.detail.member.object3D.matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  },

  memberRemoved: function(event) {

    // Shuffle down all later indices, and reduce the overall count of elements.
    // Underlying this is a single linear array of 16 x this.members.
    // Could potentially replace all this with a single Array splice command...
    for (var ii = event.detail.index; ii < (this.members - 1); ii++) {
      this.instancedMesh.getMatrixAt(ii + 1, this.matrix);
      this.instancedMesh.setMatrixAt(ii, this.matrix);
    }
    this.members--;
    this.instancedMesh.count = this.members;
    this.instancedMesh.instanceMatrix.needsUpdate = true;

  },
});

AFRAME.registerComponent('instanced-mesh-member', {
  schema: {
        mesh:       {type: 'selector'}
  },

  init: function() {
    this.index = -1;
    this.listeners = {
      memberRegistered: this.memberRegistered.bind(this),
      object3DUpdated: this.object3DUpdated.bind(this),
    };
    this.attachEventListeners();
    this.data.mesh.emit('memberAdded', {member: this.el});

  },

  attachEventListeners: function() {
    this.el.addEventListener('memberRegistered', this.listeners.memberRegistered, false);
    this.el.addEventListener('object3DUpdated', this.listeners.object3DUpdated, false);
    this.el.addEventListener('memberRemoved', this.listeners.memberRemoved, false);
  },

  remove: function() {
    this.data.mesh.emit("memberRemoved", {'index': this.index});
  },

  // This should be invoked whenever the Object3D is updated.
  // Mirror any changes across to the parent instance mesh.
  object3DUpdated: function(event) {
    this.data.mesh.emit('memberModified', {'index': this.index,
                                          'member': this.el});
  },

  // Just store the index, so we can pass it back on
  // modification or deletion
  memberRegistered: function(event) {
    this.index = event.detail.index;
  }

});
