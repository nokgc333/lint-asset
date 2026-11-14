// The sample for the "Try a sample" button (FR-011): a small model with deliberate problems, made
// by tests/tools/make_samples.py. It is served from this site, so no other address is contacted.
import sampleUrl from "../../samples/toy-house-broken.glb?no-inline";

export const SAMPLE_FILE_NAME = "toy-house-broken.glb";

type Fetch = (url: string) => Promise<Pick<Response, "ok" | "status" | "blob">>;

// Reads the sample as a File, the same kind of value the file picker gives, so it goes through the
// normal loading path (limits, errors, display). Throws when the sample cannot be read.
export async function fetchSampleFile(
  fetchImpl: Fetch = (url) => fetch(url),
  url: string = sampleUrl,
): Promise<File> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`The sample could not be read (HTTP ${response.status}).`);
  const blob = await response.blob();
  return new File([blob], SAMPLE_FILE_NAME, { type: "model/gltf-binary" });
}
