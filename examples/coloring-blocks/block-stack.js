AFRAME.registerComponent('block-stack', {
  schema: {
    size: {type: 'number', default: 10 }
  },
  init() {

    const size = this.data.size
    for (let ii = 0; ii < size; ii++) {
      for (let jj = 0; jj < size; jj++) {
        for (let kk = 0; kk < size; kk++) {
          block = document.createElement('a-entity')
          block.id = `block-${ii}-${jj}-${kk}`
          block.object3D.position.set(ii - size / 2, jj - size / 2, kk - size / 2)
          block.setAttribute("instanced-mesh-member",
                             {mesh: "#mesh"})
          this.el.appendChild(block)

          raycastProxy = document.createElement('a-box')
          raycastProxy.object3D.visible = false
          raycastProxy.setAttribute("raycast-events", "")
          
          block.appendChild(raycastProxy)
        }
      }
    }
  }
})

AFRAME.registerComponent('click-listener', {

  init() {
    this.click = this.click.bind(this)
    window.addEventListener('mousedown', this.click)

    // disable right-click context menu
    window.addEventListener('contextmenu', event => event.preventDefault());
  },

  click(event) {

    if (event instanceof MouseEvent) {
      const el = this.clickedEl
      if (el) {
        const button = event.button
        if (button === 0) {
          // left click
          el.setAttribute("instanced-mesh-member", "colors: black, green")
          el.emit('object3DUpdated')
        }
        else if (button == 2) {
          // right click
          if (el.parentNode) {
            el.parentNode.removeChild(el)
          }
        }
      }
    }
  }
})

AFRAME.registerComponent('raycast-events', {

  init() {

    // bind methods.
    this.mouseEnter = this.mouseEnter.bind(this)
    this.mouseLeave = this.mouseLeave.bind(this)
    this.click = this.click.bind(this)

    // On hover, reduce size to 0.45 unless already smaller than that.
    this.el.addEventListener('mouseenter', this.mouseEnter)
    this.el.addEventListener('mouseleave', this.mouseLeave)
    this.el.addEventListener('mousedown', this.click)    
  },

  mouseEnter() {
    const el = this.getRaycastTarget()
    if (el) {
      el.object3D.scale.set(0.9, 0.9, 0.9)
      el.emit('object3DUpdated')
    }
  },

  mouseLeave() {
    const el = this.getRaycastTarget()
    if (el) {
      el.object3D.scale.set(1, 1, 1)
      el.emit('object3DUpdated')
    }
  },

  click() {
    // don't handle click here as we can't distinguish between left & right clicks.
    // click is handled by scene-level click-listener.
    this.el.sceneEl.components['click-listener'].clickedEl = this.getRaycastTarget()
  },

  getRaycastTarget() {
    return this.el.parentEl
  }
})