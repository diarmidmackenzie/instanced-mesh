# instanced-mesh
A set of components to support use of three.js InstancedMesh object within A-Frame, which can dramatically improve rendering performance where a multiple identical objects are being used.

## Overview

The three.js [InstancedMesh](https://threejs.org/docs/index.html#api/en/objects/InstancedMesh) object provides a very efficient way to render multiple objects that have the same geometry, but may be in different positions, orientations or scales..  In particular, it massively reduces the number of draw calls required - which is very frequently the bottlneck in terms of rendering performance.

A-Frame does not natively provide access to InstancedMesh, and the A-Frame DOM doesn't map very naturally across to Instanced Meshes.

This component intends to provide a way for A-Frame applications to make use of Instanced Mesh, while retaining maximum flexibility in how entities are organized within the A-Frame DOM.

## Installation

You will need the instanced-mesh javascript module from this repository.

You can download it and include it like this:

```
<script src="instanced-mesh.js"></script>
```

Or via JSDelivr CDN (check the releases in the repo for the best version number to use)

```
<script src="https://cdn.jsdelivr.net/gh/diarmidmackenzie/instanced-mesh@v0.1-alpha/src/instanced-mesh.min.js"></script>
```

## Quickstart Guide

The basic set-up is as follows:
- Create a new entity, with the component "instanced-mesh" configured on it, and the desired geometry, materials etc. that you want to  have multiple instances of.  Do *not* set any position, rotation or scale on this entity (doing so is highly likely to cause problems - see notes below!)
- For each entity that has this geometry and materials, you won't need any geometry and materials configured.  Just set position, rotation & scale as required, and configure the "instanced-mesh-member" component, with a reference to the "instanced-mesh".

Both the instanced-mesh entity and the member entities *must* all have ids configured.

Repeat the above for each type of object that you want to have multiple instances of.

See the rest of this doc for more details, but this should be enough to get you started...

Note: if your objects are not all in the same Frame of Reference as each other, you'll need to take more care - read on below...

## Design Considerations

#### When should you use an Instanced Mesh?

Instanced Meshes work best for large collections of static objects, with the same geometry and materials, but different positions, orientations and/or scales.  This is where you will see the most substantial benefits.

Instanced Meshes can also be used for objects that:

- are moving, rotating or changing in scale
- have dynamic lifecycles (creation & deletion)

In theory Instanced Meshes also allow for color variation between instances, but this only works for single-color objects, and isn't yet supported in this component.

An Instanced Mesh requires the same number of draw calls for the entire set of instances, that would be required for a single object.  Therefore even if you only have 2 instances of an object, an Instanced Mesh could reduce the number of draw calls required.  However you'll get the greatest impact if you prioritize the objects with the most instances first.

For objects that are dynamic (either in terms of movement/rotation/scale, or creation/deletion), Instanced Mesh gives the same benefits in terms of rendering, but there is also an additional cost in keeping the Instanced Mesh in sync with the A-Frame entities.  Some basic testing suggests that if *all* the entities are moving every frame, you'll get about the same performance with Instanced Mesh, that you would without it.  If *hal*f the entities are moving every frame, you'll get a noticeable (maybe 50%) performance gain from using Instanced Meshes.

Creation, and especially deletion are a bit more expensive, but it's unless the lifecycle is extremely fast, it's likely that you'll see some gains from Instanced Mesh.  Hopefully it's straightforward to try it out, see what the gains are like, and remove it if it's not making enough of a difference.

#### How many should you use?

Ideally, you'd use a single Instanced Mesh for all instances of a particular object.  However there are a few reasons why you might want to split your objects between multiple Instanced Meshes, or not include some entities in the Instanced Mesh at all...

1. Different colored objects.  Three.js InstancedMesh can support different colors for different instances, but that's not supported by this component yet.  In any case, it only works for single-colored objects.  An InstancedMesh *can* be used with multi-colored objects (see many of the examples in /tests/ which mostly use 2-material objects), but you need a separate Instanced Mesh for each set of colors.

2. Different Frames of Reference.  Currently, the position and orientation of all members of an Instanced Mesh must be in the same Frame of Reference.  That's a restriction that I hope to remove in future, but even when I do, there will be a moderate performance overhead in overlapping between Frames of Reference, so it may be that you get still better performance in some cases by having a separate Instanced Mesh for each Frame of Reference.

3. Separation of objects / avoidance of complexity.  When entities are rendered via an Instanced Mesh, rather than direct A-Frame rendering, this adds a level of complexity.  If objects aren't behaving as expected, it makes debugging and diagnosis of problems more complex, and increases the risk of interactions between otherwise separated parts of your scene.  This is particularly true if everything is piled into a small number of communal Instanced Meshes.  This may be best for performance, but it may become much harder to figure out what is going on, when things don't act as you expect.

4. If you wish to use Frustrum Culling, it can only be applied to an entire Instanced Mesh.  Therefore if you have clusters of the same object, in multiple different areas, it may make sense to use different Instanced Meshes, so that one cluster can be frustrum culled, without affecting the other.

   

#### An illustrative Example...

To illustrate with an example, this component was originally developed to support a [Tetris game](https://github.com/diarmidmackenzie/tetrisland), in which:

- each Arena contained a large number of blocks of different colors
- there were multiple gameplay Arenas within the overall scene.

My current implementation uses:

- Separate Instanced Meshes for each arena (for reasons 2 & 3)
- Within each Arena, separate Instanced Meshes for each block color (for reason 1)
- Frustrum Culling applied to Instanced Meshes within each arena.
- No Instanced Mesh at all for blocks that are currently in play.  Only those that have landed in the arena are incorporated into Instanced Meshes.

With these decisions, I've been striking a balance between performance and complexity.  Initially I kept the arenas separate for reasons of complexity.  But subsequently, this separation has allowed for effective frustrum culling to be set up, which has further boosted performance.

There are still a relatively large number of Instanced Meshes, but is not currently an issue, as performance is now bottlenecked by the number of triangles being rendered, rather than by the number of three.js calls.

## Interface

### instanced-mesh

This should be configured on an entity that describes the desired geometry and materials of the members of the Instanced Mesh.  The entity *must* be configured with an id.

This entity should be in the same Frame of Reference as all the members of this mesh.  (if all members of the mesh are not in the same Frame of Reference, use multiple Instanced Meshes!)

Configuration as follows:

- capacity: The number of members that can be in this mesh.  Excess capacity has a modest overhead in memory usage, and no impact on rendering costs.  Default: 100.  If you exceed this capacity, you'll get a console warning, and the last requested object will simply not be rendered.
- fcradius: The radius for the bounding Sphere used for Frustrum Culling.  Default is 0, which means no frustrum culling occurs.  When specified with a positive value, frustrum culling is enabled on the mesh using a bounding sphere with this radius, and center fccenter (next property).  If set zero or negative, there is no frustrum culling, and the whole mesh is rendered the whole time, even when off camera.  Note that frustrum culling is all-or-nothing, applied to the whole mesh.  Frustrum culling of individual members is not possible.
- fccenter: The center for the bounding Sphere used for Frustrum Culling.  This is only meaningful if fcradius is specified with a value greater than 0.  The format is 3 co-ordinates, separated with spaces (like a position), representing the X, Y and Z co-ordinates.  These co-ordinates are interpreted in the local position space of the entity the instanced-mesh is applied on (which may be different from world space).
- layers: A string listing the layers in which the Instanced Mesh should be rendered (affects the entire mesh).  A string like "0, 1" to render in layers 0 & 1.  Default is "", which leaves the default behaviour in place (equivalent to setting layers:"0", except that the latter would explicitly set them to 0, rather them leaving them unchanged).  For more on THREE.js layers see https://threejs.org/docs/index.html#api/en/core/Layers and https://github.com/bryik/aframe-layers-component 
  - Note that the A-Frame Layers component doesn't work with Instanced Meshes, which is why layers support has been added directly to this component.
- debug: enables some debug console logs.  If you have a large number of dynamic objects, this will hurt performance.

### instanced-mesh-member

This should be configured on an entity that describes the desired position, orientation and scale of a single member of the Instanced Mesh.  The entity *must also* be configured with an id.

As per above, this entity should be in the same Frame of Reference as the mesh that it is to be a member of.

Configuration as follows:

- mesh: The id of the mesh that this entity is to be a member of.
- debug: enables some debug console logs.  If you have a large number of dynamic objects, this will hurt performance.

In order to ensure that changes are synchronized to the mesh, a custom event, "object3DUpdated" *must* be emitted on this entity whenever the entity's object3D configuration is updated - see next section.

### object3DUpdated Event

The object3DUpdated event is very important.

This event must be emitted on any entity that uses the instanced-mesh-member component, whenever that entity's object3D settings are updated.

Specifically, this must be done:

- whenever the object's position, rotation or scale are modified.
- whenever the object's visibility state changes (visible = true/false)

If this event is not emitted, the Instanced Mesh won't be updated with the change, and the rendered object will no become out of sync with what is set on the object.

The reason this event is used, rather than e.g. scanning all objects for any such updates, is for performance reasons.

This should be a minimal addition to application code.  After completing any set of changes to the object3D, whether done directly, or via setAttribute, e.g.

```
el.object3D.position.x += 0.1
```

just add this line...

```
el.emit("object3DUpdated")
```

### Using Mixins

If existing object code uses mixins to set geometry and materials, it should be very straightforward to move an an Instanced Mesh rendering model.

Previously, you might have a mixin like this.

```
<a-mixin id="red-box"
         geometry="primitive: box;"
         material="color:red"
         scale="0.1 0.1 0.1">
 </a-mixin>
```

This can simply be replaced by the following - and the entities that make use of the mixin won't need to be modified at all (*)

     <a-entity id="mesh-red-box"
               geometry="primitive: box;"
               material="color:red">
    </a-entity>
    <a-mixin id="red-box"
             instanced-mesh-member="mesh:#mesh-red-box"
             scale="0.1 0.1 0.1">
    </a-mixin>
(*) Two modifications that may be needed:

- Every entity must have an id that is unique within the mesh
- Any code that modifies object3D properties must be updated to emit the object3DUpdated event, as per above.



### instanced-mesh-member-parent

This doesn't exist yet.  It's an anticipated component to facilitate cascading of object3DUpdated events to all children beneath a parent.

Such cascading will be required when movement of a parent object leads to movement of a large number of child objects that are members of an Instanced Mesh.  That will become necessary once we support diverse Frames of Reference for mesh & mesh members. (coming soon... ???)



## Supported Features

#### Supported Features - Tested

The following features have been explicitly tested, and are expected to work:

On the mesh:

- Various geometries
- Various materials

On the member entity:

- Movement (i.e. change of position)
- Rotation (i.e. change of orientation) - can be set via rotation or quaternion settings
- Change of scale
- Change of visibility: visible = true / false.
- Creation & deletion.

#### Should work - not yet tested

The following features ought to work, but have not yet been tested.

On the mesh:

- Shadows: castShadow & receiveShadow properties.  These are set for the entire mesh as a whole, and I'd expect them to work.
- Transparency & Opacity.

On the member entity:

- Direct updates to object3D.matrix (position, rotation or scale)

  

## Limitations

The following are known limitations.  Some of these are easy to lift.  Others less so...

- Animation.  The A-Frame Animation component does not generate the "object3DUpdated" event, so animations applied to objects won't be reflected in the mesh.  It would be pretty easy to add an additional  component alongside animation that generated this event every tick, and as long as that was only applied to a small number of objects, performance would likely be fine.

- Changing the mesh that an entity belongs to without re-creating the entity -- This is not yet implemented - but not too complex.  Just requires instanced-member-mesh to remove the member from one mesh and add it to the other.

- Diverse Frames of Reference - This is not yet implemented.  It's relatively straightforward to map between the different Frames of Reference, but performance is a point of concern, especially when a Frame of Reference that affects a large number of members changes, and all positions have to be updated to reflect this.

- Frustrum Culling is supported, but there are no automatic calculations.  To use frustrum culling, the user of this component must explicitly specify the center and radius for a bounding sphere that contains all members of the Instanced Mesh.

- Others...?  There's bound to be a bunch of relevant stuff that I don't know about.  If it's not been explicitly mentioned as supported / tested, then it probably doesn't work!  Feel free to try things out.  If things work, please add tests to /tests/ and notes to this README!

  

## Examples

For now, see the various cases covered in /tests/ for examples of usage.



## Acknowledgements

This component was a big help in getting started with three.js InstancedMesh in A-Frame.

https://github.com/EX3D/aframe-InstancedMesh

And [@kfarr](https://stackoverflow.com/users/5347747/kieran-f) helped me to discover that repo, thanks to [this](https://stackoverflow.com/questions/66178788/how-can-i-merge-geometries-in-a-frame-without-losing-material-information) Stack Overflow answer.



I'm indebted to 