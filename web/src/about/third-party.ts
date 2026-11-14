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
    name: "Dragonbox",
    license: "Apache-2.0 with LLVM exceptions / BSL-1.0",
    url: "https://github.com/jk-jeon/dragonbox",
  },
];
