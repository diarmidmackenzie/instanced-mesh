AFRAME.registerComponent('spheres', {
  init() {

    for (let ii = 0; ii < 36; ii++) {
      this.createSphere(ii)
    }
  },

  createSphere(index) {
    const sphere = document.createElement('a-entity')
    const colorString = `#${Math.floor(Math.random()*4096).toString(16).padStart(3, "0")}`
    sphere.setAttribute("instanced-mesh-member", { mesh: "#sphere-mesh", 
                                                   colors: colorString })
    const p = sphere.object3D.position
    p.set(-3.6 + 0.2 * index, -2, 0)
    sphere.setAttribute("animation", {property: "position",
                                      from: `${p.x} -2 ${p.z}`,
                                      to: `${p.x} 2 ${p.z}`,
                                      dur: 1800,
                                      dir: "alternate",
                                      loop: true,
                                      easing: "easeInOutSine",
                                      delay: 1000 + index * 100})
    this.el.appendChild(sphere)
  }
})
