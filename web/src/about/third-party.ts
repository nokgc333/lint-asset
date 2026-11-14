import { dependencies } from "../../../package.json";

export const THIRD_PARTY_COMPONENTS: readonly {
  name: string;
  version?: string;
  license: string;
  url: string;
}[] = [
  {
    name: "tinygltf",
    version: "3.1.0",
    license: "MIT",
    url: "https://github.com/syoyo/tinygltf",
  },
  {
    name: "three.js",
    version: dependencies.three,
    license: "MIT",
    url: "https://threejs.org/",
  },
  {
    name: "fast_float",
    license: "Apache-2.0 / MIT / BSL-1.0",
    url: "https://github.com/fastfloat/fast_float",
  },
  {
    name: "Emscripten",
    version: "7.0.0",
    license: "MIT / NCSA",
    url: "https://github.com/emscripten-core/emscripten",
  },
  {
    name: "musl libc",
    license: "MIT",
    url: "https://musl.libc.org/",
  },
  {
    name: "LLVM libc++, libc++abi and compiler-rt",
    license: "Apache-2.0 with LLVM exceptions",
    url: "https://llvm.org/",
  },
  {
    name: "dlmalloc",
    license: "Public domain (CC0)",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    name: "Dragonbox",
    license: "Apache-2.0 with LLVM exceptions / BSL-1.0",
    url: "https://github.com/jk-jeon/dragonbox",
  },
];
