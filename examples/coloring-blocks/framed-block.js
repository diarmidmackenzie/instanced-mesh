// A variation of the framed-block geometry that uses vertex coloring
// to apply different colors to the face & frame.
// This has the benefit of allowing the two colors to be rendered within a single draw call.
// When used with an instanced mesh, blocks can still be re--colored on a per-member basis.
// However there is only a single color attribute per-block, and vertex colors can't be "drained"
// This means that the base vertex coloring applied will be incorporated into the final coloring.
// Some examples:
// - mesh has black frame, white faces.  member color is red => black frame, red face.
// - mesh has white frame, black face.  member color is red => red frame, black face.
// - mesh has red frame, white face.  member color is blue => black frame, blue face.

AFRAME.registerGeometry('framed-block-vx', {
  schema: {
    height:     {type: 'number', default: 2},
    width:      {type: 'number', default: 2},
    depth:      {type: 'number', default: 2},
    frame:      {type: 'number', default: 0.2},
    framecolor: {type: 'color', default: '#000'},
    facecolor:  {type: 'color', default: '#fff'}
  },

  init: function (data) {
  
    // Create geometry.
    const BIGX = data.width / 2
    const BIGY = data.height / 2
    const BIGZ = data.depth / 2
    const SMALLX = data.width / 2 - data.frame
    const SMALLY = data.height / 2 - data.frame
    const SMALLZ = data.depth / 2 - data.frame
  
    this.geometry = new THREE.BufferGeometry();
    // Vertices - we have 3 vertices for each of the 8 corners of the cube.
    // Every vertex has two "small" components, and one big one.
    const vertices = new Float32Array( [
       SMALLX,  SMALLY,    BIGZ,
       SMALLX,    BIGY,  SMALLZ,
       BIGX,    SMALLY,  SMALLZ,
  
       SMALLX,  SMALLY,   -BIGZ,
       SMALLX,    BIGY, -SMALLZ,
       BIGX,    SMALLY, -SMALLZ,
  
       SMALLX, -SMALLY,    BIGZ,
       SMALLX,   -BIGY,  SMALLZ,
       BIGX,   -SMALLY,  SMALLZ,
  
       SMALLX, -SMALLY,   -BIGZ,
       SMALLX,   -BIGY, -SMALLZ,
       BIGX,   -SMALLY, -SMALLZ,
  
      -SMALLX,  SMALLY,    BIGZ,
      -SMALLX,    BIGY,  SMALLZ,
      -BIGX,    SMALLY,  SMALLZ,
  
      -SMALLX,  SMALLY,   -BIGZ,
      -SMALLX,    BIGY, -SMALLZ,
      -BIGX,    SMALLY, -SMALLZ,
  
      -SMALLX, -SMALLY,    BIGZ,
      -SMALLX,   -BIGY,  SMALLZ,
      -BIGX,   -SMALLY,  SMALLZ,

      -SMALLX, -SMALLY,   -BIGZ,
      -SMALLX,   -BIGY, -SMALLZ,
      -BIGX,   -SMALLY, -SMALLZ,
  
      // separate set of vertices for faces to prevent
      // bleed when using vertex coloring.
      SMALLX,  SMALLY,    BIGZ,
      SMALLX,    BIGY,  SMALLZ,
      BIGX,    SMALLY,  SMALLZ,
 
      SMALLX,  SMALLY,   -BIGZ,
      SMALLX,    BIGY, -SMALLZ,
      BIGX,    SMALLY, -SMALLZ,
 
      SMALLX, -SMALLY,    BIGZ,
      SMALLX,   -BIGY,  SMALLZ,
      BIGX,   -SMALLY,  SMALLZ,
 
      SMALLX, -SMALLY,   -BIGZ,
      SMALLX,   -BIGY, -SMALLZ,
      BIGX,   -SMALLY, -SMALLZ,
 
     -SMALLX,  SMALLY,    BIGZ,
     -SMALLX,    BIGY,  SMALLZ,
     -BIGX,    SMALLY,  SMALLZ,
 
     -SMALLX,  SMALLY,   -BIGZ,
     -SMALLX,    BIGY, -SMALLZ,
     -BIGX,    SMALLY, -SMALLZ,
 
     -SMALLX, -SMALLY,    BIGZ,
     -SMALLX,   -BIGY,  SMALLZ,
     -BIGX,   -SMALLY,  SMALLZ,
 
     -SMALLX, -SMALLY,   -BIGZ,
     -SMALLX,   -BIGY, -SMALLZ,
     -BIGX,   -SMALLY, -SMALLZ,
    ] );
  
    // itemSize = 3 because there are 3 values (components) per vertex
    this.geometry.setAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
  
    // Now we define the faces in terms of vertex indices.
    const indices = []
  
    // 8 corner triangles.
    indices.push(0, 2, 1,
                 3, 4, 5,
                 6, 7, 8,
                 9, 11, 10,
                 12, 13, 14,
                 15, 17, 16,
                 18, 20, 19,
                 21, 22, 23);
  
    // 12 edges.
    createRectangle(1, 2, 4, 5)
    createRectangle(0, 1, 12, 13)
    createRectangle(2, 0, 8, 6)
    createRectangle(4, 3, 16, 15)
    createRectangle(3, 5, 9, 11)
    createRectangle(7, 6, 19, 18)
    createRectangle(8, 7, 11, 10)
    createRectangle(9, 10, 21, 22)
    createRectangle(12, 14, 18, 20)
    createRectangle(14, 13, 17, 16)
    createRectangle(17, 15, 23, 21)
    createRectangle(19, 20, 22, 23)
  
    // 6 faces.
    createRectangle(6, 0, 18, 12, 24)
    createRectangle(3, 9, 15, 21, 24)
    createRectangle(1, 4, 13, 16, 24)
    createRectangle(10, 7, 22, 19, 24)
    createRectangle(5, 2, 11, 8, 24)
    createRectangle(14, 17, 20, 23, 24)
  
    function createRectangle(a, b, c, d, offset = 0) {
      indices.push(offset + a, offset + b, offset + c);
      indices.push(offset + c, offset + b, offset + d);
    }
  
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
  
    // 8 + 2 x 12 = 32 triangles = 96 vertices for the "frame"
    //this.geometry.addGroup(0, 96, 0 );
    // 2 x 6 = 12 triangles = 36 vertices for the faces.
    //this.geometry.addGroup(96, 36, 1);

    // 1st 24 vertices are colored black, next 24 vertices are colored white.
    const colors = new Float32Array(48 * 3);
    const color = new THREE.Color(data.framecolor)
    for ( let i = 0; i < 24; i++ ) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    color.set(data.facecolor)
    for ( let i = 24; i < 48; i++ ) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
});

AFRAME.registerComponent('framed-block-vx', {
  schema: {
    height:     {type: 'number', default: 2},
    width:      {type: 'number', default: 2},
    depth:      {type: 'number', default: 2},
    frame:      {type: 'number', default: 0.2},
    framecolor: {type: 'color', default: '#000'},
    facecolor:  {type: 'color', default: '#AAA'}
  },

  /**
   * Initial creation and setting of the mesh.
   */
  init: function () {

    const data = this.data;
    const el = this.el;

    el.setAttribute('geometry', { primitive: "framed-block-vx",
                                  height: this.data.height,
                                  width: this.data.width,
                                  depth: this.data.depth,
                                  frame: this.data.frame,
                                  framecolor: this.data.framecolor,
                                  facecolor: this.data.facecolor});
    
    // Create material.  Colorign is done via vertices.
    this.material = new THREE.MeshStandardMaterial({roughness: 0.3, vertexColors: true});

    // Create mesh.
    const mesh = this.el.getObject3D('mesh');
    mesh.material = this.material
}
});
