// English texts of the fix guide (see fix-hints.ts). The tool lines name menus and nodes exactly as
// the tools do; the Japanese texts keep those names unchanged.

export const FIX_HINT_TEXTS_EN: Record<string, string> = {
  "hint.normal.flipped.meaning":
    "The vertex normals point the opposite way to the order in which the triangle's corners are listed (its winding). Shading and back-face culling then disagree.",
  "hint.normal.flipped.why":
    "Engines cull faces by winding and light them by normals. When the two disagree, parts of the model can look inside out, dark, or invisible from one side.",
  "hint.normal.flipped.fix":
    "Make the faces point outward consistently, apply any negative scale, and export again. Check the result with a face-orientation or back-face display.",
  "hint.normal.flipped.tool.blender":
    "Turn on the Face Orientation overlay (red faces point the wrong way). In Edit Mode select the faces and use Mesh > Normals > Recalculate Outside (Shift+N) or Mesh > Normals > Flip. Apply scale with Object > Apply > Scale.",
  "hint.normal.flipped.tool.maya":
    "Select the faces and use Mesh Display > Reverse, or Mesh Display > Conform to make the normals of a shell consistent.",
  "hint.normal.flipped.tool.max":
    "Add a Normal modifier and switch on Unify normals (and Flip normals if the whole object is inside out), or use Flip on the selected polygons in Edit Poly.",

  "hint.normal.missing.meaning": "The primitive has no vertex normals.",
  "hint.normal.missing.why":
    "Without normals the viewer has to guess the shading, so the model can look flat or faceted, and normal maps cannot work reliably.",
  "hint.normal.missing.fix":
    "Export with normals included. For smooth shading, make sure the mesh has smooth normals before you export.",
  "hint.normal.missing.tool.blender": "In the glTF export, under Data > Mesh, turn on Normals.",
  "hint.normal.missing.tool.unreal":
    "On import you can have the engine compute the normals (FBX import option Normal Import Method > Compute Normals).",

  "hint.normal.unnormalized.meaning":
    "The vertex normals are not unit length: their length is not 1.",
  "hint.normal.unnormalized.why":
    "Lighting and normal maps assume unit-length normals. Otherwise the shading comes out too bright or too dark.",
  "hint.normal.unnormalized.fix":
    "Normalize the normals. Remove unapplied or non-uniform scale, undo hand-edited custom normals, and export again.",
  "hint.normal.unnormalized.tool.blender":
    "Apply the scale of the object with Object > Apply > Scale before you export.",

  "hint.mesh.nonmanifold_edge.meaning":
    "An edge is shared by three or more triangles, like a fin or an inner wall that sticks out of a surface.",
  "hint.mesh.nonmanifold_edge.why":
    "Non-manifold geometry breaks smoothing, UV unwrapping, physics, and 3D printing, and many tools cannot process it.",
  "hint.mesh.nonmanifold_edge.fix":
    "Find the extra faces or the doubled geometry, delete or separate them, and merge duplicate vertices.",
  "hint.mesh.nonmanifold_edge.tool.blender":
    "In vertex or edge select mode use Select > Select All by Trait > Non Manifold with Multiple Faces turned on. Then delete or separate the extra faces, and use Merge by Distance for duplicate vertices.",
  "hint.mesh.nonmanifold_edge.tool.maya":
    "Use Mesh > Cleanup with the option for nonmanifold geometry switched on.",
  "hint.mesh.nonmanifold_edge.tool.houdini":
    "Use the Fuse SOP to merge points that sit at the same place, then remove the extra primitives.",

  "hint.mesh.boundary_edge.meaning":
    "An edge is used by only one triangle: it is the rim of a hole or an open border. That is intended for planes, cloth, and leaves, and a defect in a solid object.",
  "hint.mesh.boundary_edge.why":
    "A hole in a solid object lets you see inside and breaks lighting and baking. A surface that is open on purpose is fine.",
  "hint.mesh.boundary_edge.fix":
    "If the model should be closed, fill or sew the hole, and merge doubled vertices at seams.",
  "hint.mesh.boundary_edge.tool.blender":
    "Use Select > Select All by Trait > Non Manifold with Boundaries turned on to see the holes. Then use Mesh > Clean Up > Fill Holes (or Face Fill or Grid Fill for a large hole), and Merge by Distance at seams.",
  "hint.mesh.boundary_edge.tool.maya": "Select an edge of the hole and use Mesh > Fill Hole.",
  "hint.mesh.boundary_edge.tool.max": "Use the Cap Holes modifier, or cap the border in Edit Poly.",
  "hint.mesh.boundary_edge.tool.houdini": "Use the PolyFill SOP to fill holes with polygons.",

  "hint.mesh.degenerate_triangle.meaning":
    "A triangle has almost no area (its corners lie on one line or at one point), or one of its positions is not a valid number.",
  "hint.mesh.degenerate_triangle.why":
    "It cannot be shaded or given a normal, and it can cause invalid values, flicker, or errors in baking and physics.",
  "hint.mesh.degenerate_triangle.fix":
    "Delete or collapse the zero-area triangles, and merge the points they collapse onto.",
  "hint.mesh.degenerate_triangle.tool.blender":
    "Use Mesh > Clean Up > Degenerate Dissolve, which collapses edges that are shorter than the merge distance.",
  "hint.mesh.degenerate_triangle.tool.maya":
    "Use Mesh > Cleanup with the option for faces with zero geometry area switched on.",
  "hint.mesh.degenerate_triangle.tool.houdini":
    "Use the Clean SOP with Remove Degenerate Primitives, or the Fuse SOP with Remove Repeated Vertices and Degenerate Primitives.",
  "hint.mesh.degenerate_triangle.tool.unreal":
    "Keep Remove Degenerates switched on in the FBX import options.",

  "hint.uv.missing.meaning": "The primitive has no UV coordinates.",
  "hint.uv.missing.why":
    "Without UVs no texture can be applied. A model that uses only vertex colors or plain materials does not need them.",
  "hint.uv.missing.fix":
    "Unwrap the model and export with UVs. If the model does not use textures, you can ignore this.",
  "hint.uv.missing.tool.blender":
    "In Edit Mode use UV > Unwrap (U), for example Smart UV Project, and turn on UVs in the glTF export under Data > Mesh.",
  "hint.uv.missing.tool.houdini":
    "Use the UV Auto Seam SOP with the UV Flatten SOP (or the UV Unwrap SOP), then the UV Layout SOP to pack the islands.",

  "hint.uv.out_of_range.meaning":
    "Some UV coordinates lie outside the 0 to 1 square of the texture.",
  "hint.uv.out_of_range.why":
    "Tiling textures are made this way, so it can be intended. Otherwise parts of the texture repeat or are cut off, and an atlas or a baked texture shows the wrong pixels.",
  "hint.uv.out_of_range.fix":
    "If the texture is not meant to tile, scale and move the UV islands into the 0 to 1 square.",
  "hint.uv.out_of_range.tool.blender":
    "In the UV Editor select everything and scale the islands, or use UV > Pack Islands to fit them in the square.",
  "hint.uv.out_of_range.tool.houdini":
    "Use the UV Layout SOP to pack the islands into the 0 to 1 area.",

  "hint.uv.overlap.meaning":
    "Triangles cover the same part of the texture. If they face the same way it is an error. If they are mirrored (left and right halves that share one area) it is a warning.",
  "hint.uv.overlap.why":
    "Overlapping islands share pixels, so baked lighting or painted detail from one part shows up on another. A mirrored layout is a common and intended way to save texture space.",
  "hint.uv.overlap.fix":
    "Separate the islands so that each part has its own area, then pack them. Keep a mirrored layout only if the model is symmetric and you want that.",
  "hint.uv.overlap.tool.blender":
    "In the UV Editor use UV > Pack Islands after you move the overlapping islands apart.",
  "hint.uv.overlap.tool.houdini": "Use the UV Layout SOP to pack the islands without overlap.",

  "hint.asset.triangle_count_exceeded.meaning":
    "The scene draws more triangles than the limit (100,000 by default). Every placement of a mesh counts.",
  "hint.asset.triangle_count_exceeded.why":
    "Many triangles cost memory and drawing time, most of all in a browser or on a phone.",
  "hint.asset.triangle_count_exceeded.fix":
    "Reduce the triangle count, remove hidden geometry, and use levels of detail. If the count is fine for your project, raise the limit in Settings.",
  "hint.asset.triangle_count_exceeded.tool.blender":
    "Add a Decimate modifier and lower its Ratio, then apply it.",
  "hint.asset.triangle_count_exceeded.tool.maya": "Use Mesh > Reduce and set the Percentage.",
  "hint.asset.triangle_count_exceeded.tool.max":
    "Add a ProOptimizer modifier and lower its Vertex % value.",
  "hint.asset.triangle_count_exceeded.tool.unreal":
    "In the Static Mesh Editor set the reduction settings of a level of detail (Percent Triangles).",

  "hint.asset.scale_too_small.meaning":
    "The longest side of the model's bounding box is smaller than the minimum (0.01 m by default).",
  "hint.asset.scale_too_small.why":
    "glTF uses metres. If a unit conversion was applied twice, or the model was built much smaller than intended, it appears 100 or 1000 times too small in the engine.",
  "hint.asset.scale_too_small.fix":
    "Check the scene unit and the export scale so that 1 unit is 1 metre, and apply the object scale before you export. If the size is right, change the limits in Settings.",
  "hint.asset.scale_too_small.tool.blender":
    "Set Scene > Units to Metric with Unit Scale 1.0, and apply the scale with Object > Apply > Scale.",
  "hint.asset.scale_too_small.tool.maya":
    "Maya works in centimetres by default. Compare Preferences > Settings > Working Units with the unit your exporter writes.",
  "hint.asset.scale_too_small.tool.max": "Check Customize > Units Setup and the system unit in it.",

  "hint.asset.scale_too_large.meaning":
    "The longest side of the model's bounding box is larger than the maximum (1000 m by default).",
  "hint.asset.scale_too_large.why":
    "glTF uses metres. A model written in centimetres or millimetres without conversion appears 100 or 1000 times too large in the engine.",
  "hint.asset.scale_too_large.fix":
    "Check the scene unit and the export scale so that 1 unit is 1 metre, and apply the object scale before you export. If the size is right, change the limits in Settings.",
  "hint.asset.scale_too_large.tool.blender":
    "Set Scene > Units to Metric with Unit Scale 1.0, and apply the scale with Object > Apply > Scale.",
  "hint.asset.scale_too_large.tool.maya":
    "Maya works in centimetres by default. Compare Preferences > Settings > Working Units with the unit your exporter writes.",
  "hint.asset.scale_too_large.tool.max": "Check Customize > Units Setup and the system unit in it.",

  "hint.asset.external_uri.meaning":
    "The file lists images that are stored outside it (a web address or a file path). This tool never opens them.",
  "hint.asset.external_uri.why":
    "A viewer or an engine may try to load them. The images can be missing, and a web address can send a request when the model is opened.",
  "hint.asset.external_uri.fix":
    "Export a single .glb file that includes the textures, so the file does not depend on anything else.",
  "hint.asset.external_uri.tool.blender":
    "Export with Format: glTF Binary (.glb), which packs the images into the file.",
};
