# instanced-mesh
 Components to support use of three.js InstancedMesh object within A-Frame, to
 improve performance where a multiple identical objects are being used.

## Overview

To be completed...

Very high level, trying to make it easy to use InstancedMesh to implement the underlying rendering, with minimal impact on how things are done in the HTML / DOM...

Various things working so far, including object movements (when notified with Object3DUpdated event), and add/delete of blocks.  See /tests/ folder...

No work done yet on frames of reference, so it only works if everything is in the same frame of reference, and the instanced-mesh objects are at 0 0 0 position & rotation.  I will be working to address that, and also provide some proper documentation here...



## Acknowledgements

This component was a big help in getting started with three.js InstancedMesh in A-Frame.

https://github.com/EX3D/aframe-InstancedMesh

And [@kfarr](https://stackoverflow.com/users/5347747/kieran-f) helped me to discover that repo, thanks to [this](https://stackoverflow.com/questions/66178788/how-can-i-merge-geometries-in-a-frame-without-losing-material-information) Stack Overflow answer.
