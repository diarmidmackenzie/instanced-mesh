AFRAME.registerComponent('road', {

  schema: {
    numVehicles: { type : 'number', default: 10},
    speed: {type: 'number', default: 3},
    length: {type: 'number', default: 500}
  },

  init() {
    this.vehicles = []

    for (var ii = 0; ii < this.data.numVehicles; ii++) {
      const vehicle = this.createVehicle(ii)
      this.vehicles.push(vehicle)
    }
  },

  createVehicle(index) {
    const roadLength = this.roadLength()
    zPosition = (Math.random() * roadLength) - (roadLength / 2)

    const vehicle = document.createElement('a-entity')
    vehicle.setAttribute("id", `${this.el.id}-vehicle-${index}`)
    vehicle.setAttribute("instanced-mesh-member", "mesh:#car-instanced-mesh")
    vehicle.setAttribute("z-movement", {speed: this.data.speed,
                                        loopLower: -roadLength/2,
                                        loopUpper: roadLength/2})
    vehicle.object3D.position.set(0, 0.5, zPosition)
    this.el.appendChild(vehicle)

    return vehicle
  },

  roadLength() {
    return this.data.length
  }
})

AFRAME.registerComponent('z-movement', {

  schema: {
    speed: {type: 'number', default: 3},
    loopLower: {type: 'number', default: -100},
    loopUpper: {type: 'number', default: 100},
  },


  tick(time, timeDelta) {

    const delta = this.data.speed * timeDelta / 1000
    this.el.object3D.position.z += delta

    const loopLength = this.data.loopUpper - this.data.loopLower

    if (this.el.object3D.position.z > this.data.loopUpper) {
      this.el.object3D.position.z -= loopLength
    }

    if (this.el.object3D.position.z < this.data.loopLower) {
      this.el.object3D.position.z += loopLength
    }
  }
})

AFRAME.registerComponent('landscape', {

  schema: {
    numRoads: { type : 'number', default: 50},
    initialSpace: { type : 'number', default: 5},
    interval: { type : 'number', default: 3},
  },

  init() {
    this.roads = []

    for (var ii = 0; ii < this.data.numRoads; ii++) {
      const road = this.createRoad(ii)
      this.roads.push(road)
    }
  },

  createRoad(index) {
    const speed = this.getRoadSpeed(index)
    const xPosition = this.getRoadPosition(index)

    const road = document.createElement('a-entity')
    road.setAttribute("id", `road-${index}`)
    road.setAttribute("instanced-mesh-member", "mesh:#road-mesh")    
    road.setAttribute("road", {numVehicles: 10,
                               speed: speed})
    road.object3D.position.set(xPosition, -0.99, 0)

    this.el.appendChild(road)

    return road
  },

  getRoadSpeed(index) {
    const speed = index / 5 + 20 * Math.random()
    return speed
  },

  getRoadPosition(index) {
    const position = this.data.initialSpace + 
                     (index * this.data.interval)
    return position
  }
})
