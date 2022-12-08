let selectedPaletteEl;

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

        if (el.parentEl.parentEl.parentEl.id === "palette") return;

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

    let colors
    if (selectedPaletteEl) {
      colors = selectedPaletteEl.components["instanced-mesh-member"].colors
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
    return (selectedPaletteEl === this.getRaycastTarget())
  },

  selectThis() {
    
    if (selectedPaletteEl) {
      selectedPaletteEl.object3D.scale.set(1, 1, 1)
      selectedPaletteEl.emit('object3DUpdated')
    }

    if (selectedPaletteEl !== this.getRaycastTarget()) {
      selectedPaletteEl = this.getRaycastTarget()
      return true
    }
    else {
      selectedPaletteEl = null
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