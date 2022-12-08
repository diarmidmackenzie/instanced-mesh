// Create a cube of blocks of given dimension
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
                             {mesh: "#block-mesh"})
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

// Create a rectangle of colored blocks that can be used as a palette.
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
                            {mesh: "#palette-mesh", 
                             colors: [`#${color.getHexString()}`]})
        this.el.appendChild(block)

        const raycastProxy = document.createElement('a-box')
        raycastProxy.object3D.visible = false
        raycastProxy.setAttribute("palette-events", "")
        
        block.appendChild(raycastProxy)
      }
    }
  }
})

// Window level click listenr.  Needed because we can't distinguish between
// left & right clicks on the click events from cursor.
// We can simplify this in A-Frame 1.4.0 thanks to this PR 
// https://github.com/aframevr/aframe/pull/5088
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
      colors = "white"
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
    this.mouseUp = this.mouseUp.bind(this)

    // On hover, reduce size to 0.45 unless already smaller than that.
    this.el.addEventListener('mouseenter', this.mouseEnter)
    this.el.addEventListener('mouseleave', this.mouseLeave)
    this.el.addEventListener('mousedown', this.click)    
    this.el.addEventListener('mouseup', this.mouseUp)   
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

  mouseUp() {
    this.el.sceneEl.components['click-listener'].clickedEl = null
  },

  getRaycastTarget() {
    return this.el.parentEl
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

    const selected = this.selectThis()

    if (selected) {
      const el = this.getRaycastTarget()
      if (el) {
        el.object3D.scale.set(0.6, 0.6, 0.6)
        el.emit('object3DUpdated')
      }
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

    if (palette.selected !== this.getRaycastTarget()) {
      palette.selected = this.getRaycastTarget()
      return true
    }
    else {
      palette.selected = null
      return false
    }
  },

  getRaycastTarget() {
    return this.el.parentEl
  }
})

AFRAME.registerComponent('mouse-object-control', {

  init: function () {

      this.rbDown = false;
      this.mbDown = false;

      // Mouse 2D controls.
      this.onMouseEvent = this.onMouseEvent.bind(this);
      window.addEventListener('mouseup', this.onMouseEvent);
      window.addEventListener('mousedown', this.onMouseEvent);

      // disable right-click context menu
      window.addEventListener('contextmenu', event => event.preventDefault());
  },

  onMouseEvent: function (evt) {
      this.mbDown = (evt.buttons & 4)
      this.lbDown = (evt.buttons & 1)

      this.updateRotationControls()
  },

  updateRotationControls() {

      if (this.lbDown) {
          this.el.setAttribute("mouse-pitch-yaw", "")
          this.el.setAttribute("mouse-dolly", "")
      }
      else {
          this.el.removeAttribute("mouse-pitch-yaw")
          this.el.removeAttribute("mouse-dolly")
      }
      if (this.mbDown) {
          this.el.setAttribute("mouse-roll", "")
      }
      else {
          this.el.removeAttribute("mouse-roll")
          
      }
  }
});