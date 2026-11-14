# Patches the pinned tinygltf source so that every block its arena hands out starts zeroed.
#
# Why: when an entry of a top-level array (buffers, accessors, meshes, ...) is not a JSON object,
# the parser skips it and leaves the entry's memory as it was, and the validation that runs inside
# tg3_parse then reads those uninitialized fields (found by fuzzing; it crashes under
# AddressSanitizer). Zeroed memory makes such an entry an empty one, which the validation rejects
# like any other bad entry. The same change fixes every array of the parser at once.
#
# Run as: cmake -DSOURCE_DIR=<tinygltf source> -P zero_arena.cmake. Safe to run twice. Both source
# files that contain the arena are patched; the library is built from tiny_gltf_v3.c.
set(marker "lint-asset: zero the block")
set(comment "/* ${marker} (see core/patches/zero_arena.cmake) */")

function(patch_file name old new)
  set(file "${SOURCE_DIR}/${name}")
  file(READ "${file}" text)
  string(FIND "${text}" "${marker}" already)
  if(NOT already EQUAL -1)
    return()
  endif()
  string(FIND "${text}" "${old}" position)
  if(position EQUAL -1)
    message(FATAL_ERROR "zero_arena.cmake: the arena code of ${name} is not what the patch expects")
  endif()
  string(REPLACE "${old}" "${new}" text "${text}")
  file(WRITE "${file}" "${text}")
endfunction()

patch_file(tiny_gltf_v3.c
  "    ptr = block->base + block->used;\n    block->used += size;\n    return ptr;\n"
  "    ptr = block->base + block->used;\n    block->used += size;\n    memset(ptr, 0, size); ${comment}\n    return ptr;\n")
patch_file(tiny_gltf_v3.h
  "    void *ptr = block->base + block->used;\n    block->used += size;\n    return ptr;\n"
  "    void *ptr = block->base + block->used;\n    block->used += size;\n    memset(ptr, 0, size); ${comment}\n    return ptr;\n")
