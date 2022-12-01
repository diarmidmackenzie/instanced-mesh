// creates a pinboard height x width, + 2m at top & bottom, laid flat.
AFRAME.registerComponent('pinboard', {

  schema: {
      physics: {type: 'string'}, // physx , ammo or cannon
      width: {type: 'number', default: 10},
      height: {type: 'number', default: 10},
  },

  init() {

      const width = this.data.width;
      const height = this.data.height;

      const createBox = (width, height, depth, x, y, z, color, yRot) => {
          const box = document.createElement('a-box');
          box.setAttribute('width', width)
          box.setAttribute('height', height)
          box.setAttribute('depth', depth)
          box.setAttribute('color', color)
          if (this.data.physics === "ammo") {
            box.setAttribute('ammo-body', 'type:static')
            box.setAttribute('ammo-shape', 'type:box;fit:all')
          }
          else if (this.data.physics === "cannon") {
              box.setAttribute('static-body', '')
          }
          else {
              box.setAttribute('physx-body', 'type:static')
          }  
          box.object3D.position.set(x, y, z)
          box.object3D.rotation.set(0, yRot, 0)
          this.el.appendChild(box)

          return box
      }

      const createPin = (x, y, z, yRot) => {
        const pin = document.createElement('a-entity');
        pin.id = Math.random().toString(36).substring(2)
        pin.setAttribute('instanced-mesh-member', 'mesh: #pin-mesh; memberMesh: true')
        if (this.data.physics === "ammo") {
          pin.setAttribute('ammo-body', 'type:static')
          pin.setAttribute('ammo-shape', 'type:box;fit:all')
        }
        else if (this.data.physics === "cannon") {
          pin.setAttribute('static-body', '')
        }
        else {
          pin.setAttribute('physx-body', 'type:static')
        }
        pin.object3D.position.set(x, y, z)
        pin.object3D.rotation.set(0, yRot, 0)
        this.el.appendChild(pin)

        return pin
      }
      

      this.base = createBox(width, 1, height + 4, 0, -0.5, 0, 'grey', 0)
      createBox(0.1, 2, height + 4, width / 2 + 0.05, 0, 0, 'grey', 0)
      createBox(0.1, 2, height + 4, -width / 2 - 0.05, 0, 0, 'grey', 0)

      for (let ii = 0; ii < this.data.height; ii++) {
          const even = ii % 2
          for (let jj = 0; jj < this.data.width - 1; jj++) {

              createPin(jj - width / 2  + even / 2 + 0.75,
                        0.5,
                        ii - height / 2 + 0.5,
                        'black',
                        Math.PI / 4)
          }
      }
  }
})

AFRAME.registerComponent('dynamic-ball', {

  schema: {
      physics: {type: 'string'}, // physx or ammo.
      yKill: {type: 'number', default: -10}
  },

  init() {
      const el = this.el
      el.setAttribute('instanced-mesh-member', 'mesh:#ball-mesh; memberMesh: true')

      if (this.data.physics === "ammo") {
        el.setAttribute('ammo-body', 'type:dynamic')
        // Explicitly specifying a shape is more efficient than auto-fitting.
        el.setAttribute('ammo-shape', 'type:sphere; fit:manual; sphereRadius: 0.3')
    }
    else if (this.data.physics === "cannon") {
        // necessary to explicitly specify sphere radius, as async call to 
        // set radius attribute on el may not have completed yet, and Cannon uses
        // the default radius of 1.
        // This is seen when recycling balls (deleting and recreating them).
        el.setAttribute('dynamic-body', 'shape: sphere; sphereRadius: 0.3')
    }
    else {
        el.setAttribute('physx-body', 'type:dynamic')
    }
  },

  tick() {
      if (this.el.object3D.position.y < this.data.yKill) {
          this.el.emit("recycle")
      }
  }
})

AFRAME.registerComponent('ball-recycler', {

  schema: {
      physics: {type: 'string'}, // physx, ammo or cannon.
      ballCount: {type: 'number', default: 10},
      width: {type: 'number', default: 8}, // width of spawn field
      depth: {type: 'number', default: 8}, // depth of spawn field (after initial spawn balls always spawned at far depth)
      yKill: {type: 'number', default: -10}
  },

  init() {

      this.recycleBall = this.recycleBall.bind(this);

      // at start of day, spawn balls 
      for (let ii = 0; ii < this.data.ballCount; ii++) {

          this.createBall(false)
      }
  },

  createBall(recycled) {

      const { height, depth, width } = this.data
      const pos = this.el.object3D.position

      const ball = document.createElement('a-sphere')
          
      ball.setAttribute('dynamic-ball', {yKill: this.data.yKill,
                                         physics: this.data.physics})
      x = pos.x + Math.random() * width - width / 2
      z = recycled ? (pos.z -depth / 2) : (pos.z + Math.random() * depth - depth / 2)
      ball.object3D.position.set(x, pos.y, z)
      this.el.sceneEl.appendChild(ball)

      ball.addEventListener('recycle', this.recycleBall);

  },

  recycleBall(evt) {

      const ball = evt.target

      ball.parentNode.removeChild(ball);
      this.createBall(true)

  }
})
