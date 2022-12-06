AFRAME.registerComponent('block-stack', {
  schema: {
    size: {type: 'number', default: 10 }
  },
  init() {

    const size = this.data.size
    for (let ii = 0; ii < size; ii++) {
      for (let jj = 0; jj < size; jj++) {
        for (let kk = 0; kk < size; kk++) {
          const block = document.createElement('a-entity')
          block.id = `block-${ii}-${jj}-${kk}`
          block.object3D.position.set(ii - size / 2, jj - size / 2, kk - size / 2)
          block.setAttribute("instanced-mesh-member",
                             {mesh: "#mesh"})
          this.el.appendChild(block)

          const raycastProxy = document.createElement('a-box')
          raycastProxy.object3D.visible = false
          raycastProxy.setAttribute("block-events", "")
          
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

        if (el.parentEl.id === "palette") return;

        const button = event.button
        if (button === 0) {
          // left click
          const colors = this.getPaletteColors()
          el.setAttribute("instanced-mesh-member", {colors: colors})
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
  },

  getPaletteColors() {
    paletteEl = document.getElementById("palette")
    selected = paletteEl.components["palette"].selected

    let colors
    if (selected) {
      colors = selected.components["instanced-mesh-member"].colors
    }
    else {
      colors = "black, white"
    }
    
    return colors
  }
})

AFRAME.registerComponent('block-events', {

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

AFRAME.registerComponent('palette', {
  schema: {
    height: {type: 'number', default: 4 },
    width: {type: 'number', default: 6 }
  },

  init() {
    const width = this.data.width
    const height = this.data.height
    for (let ii = 0; ii < width; ii++) {
      for (let jj = 0; jj < height; jj++) {
        
        const color = new THREE.Color()
        color.setHSL(ii / width, (jj + 1) / height, 0.5)

        const block = document.createElement('a-entity')
        block.id = `palette-${ii}`
        block.object3D.position.set(ii - width / 2, jj - height / 2, 0)
        block.setAttribute("instanced-mesh-member",
                            {mesh: "#mesh", 
                             colors: ["black", `#${color.getHexString()}`]})
        this.el.appendChild(block)

        const raycastProxy = document.createElement('a-box')
        raycastProxy.object3D.visible = false
        raycastProxy.setAttribute("palette-events", "")
        
        block.appendChild(raycastProxy)
      }
    }
  }
})

AFRAME.registerComponent('palette-events', {

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
    if (el && !this.isSelected()) {
      el.object3D.scale.set(0.9, 0.9, 0.9)
      el.emit('object3DUpdated')
    }
  },

  mouseLeave() {
    const el = this.getRaycastTarget()
    if (el && !this.isSelected()) {
      el.object3D.scale.set(1, 1, 1)
      el.emit('object3DUpdated')
    }
  },

  click() {

    this.selectThis()

    const el = this.getRaycastTarget()
    if (el) {
      el.object3D.scale.set(0.6, 0.6, 0.6)
      el.emit('object3DUpdated')
    }

    // update scene level view of last-clicked el.
    this.el.sceneEl.components['click-listener'].clickedEl = this.getRaycastTarget()
  },

  isSelected() {
    const selected = this.getRaycastTarget().parentEl.components['palette'].selected
    return (selected === this.getRaycastTarget())
  },

  selectThis() {
    const palette = this.getRaycastTarget().parentEl.components['palette']
    if (palette.selected) {
      palette.selected.object3D.scale.set(1, 1, 1)
      palette.selected.emit('object3DUpdated')
    }
    palette.selected = this.getRaycastTarget()
  },

  getRaycastTarget() {
    return this.el.parentEl
  }
})