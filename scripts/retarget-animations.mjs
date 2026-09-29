// Copies the human's Walking and Running clips onto a Mixamo-named rig (goat, robot), in place (no root translation).
// Usage: node scripts/retarget-animations.mjs <human.glb> <target.glb> <out.glb>
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../', import.meta.url)).replaceAll('\\', '/');
const req = createRequire(repo + 'package.json'), imp = n => import(pathToFileURL(req.resolve(n)).href);
const { NodeIO } = await imp('@gltf-transform/core');
const { KHRONOS_EXTENSIONS } = await imp('@gltf-transform/extensions');
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const [humanFile, targetFile, outFile] = process.argv.slice(2);
const human = await io.read(humanFile), target = await io.read(targetFile);
const MAP = { Hips: 'Hips', Spine: 'Spine', Spine01: 'Spine1', Spine02: 'Spine2', neck: 'Neck', Head: 'Head',
  LeftShoulder: 'LeftShoulder', LeftArm: 'LeftArm', LeftForeArm: 'LeftForeArm', LeftHand: 'LeftHand',
  RightShoulder: 'RightShoulder', RightArm: 'RightArm', RightForeArm: 'RightForeArm', RightHand: 'RightHand',
  LeftUpLeg: 'LeftUpLeg', LeftLeg: 'LeftLeg', LeftFoot: 'LeftFoot', LeftToeBase: 'LeftToeBase',
  RightUpLeg: 'RightUpLeg', RightLeg: 'RightLeg', RightFoot: 'RightFoot', RightToeBase: 'RightToeBase' };
const byName = new Map(target.getRoot().listNodes().map(n => [n.getName(), n]));
const humanNodes = new Map(human.getRoot().listNodes().map(n => [n.getName(), n]));
// Quaternion helpers (x, y, z, w).
const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const inv = q => [-q[0], -q[1], -q[2], q[3]];
const buffer = target.getRoot().listBuffers()[0];
for (const clip of human.getRoot().listAnimations()) {
  const animation = target.createAnimation(clip.getName());
  let used = 0;
  for (const channel of clip.listChannels()) {
    if (channel.getTargetPath() !== 'rotation') continue;
    const sourceName = channel.getTargetNode()?.getName(), mapped = MAP[sourceName], node = byName.get('mixamorig:' + mapped);
    if (!mapped || !node) continue;
    const restHuman = humanNodes.get(sourceName).getRotation(), restTarget = node.getRotation(), sampler = channel.getSampler();
    const input = sampler.getInput().getArray(), output = sampler.getOutput().getArray(), out = new Float32Array(output.length);
    for (let i = 0; i < input.length; i++) {
      const q = [output[i * 4], output[i * 4 + 1], output[i * 4 + 2], output[i * 4 + 3]];
      const delta = mul(inv(restHuman), q), result = mul(restTarget, delta);
      out.set(result, i * 4);
    }
    const timeAccessor = target.createAccessor().setType('SCALAR').setArray(Float32Array.from(input)).setBuffer(buffer);
    const valueAccessor = target.createAccessor().setType('VEC4').setArray(out).setBuffer(buffer);
    const newSampler = target.createAnimationSampler().setInput(timeAccessor).setOutput(valueAccessor).setInterpolation(sampler.getInterpolation());
    animation.addSampler(newSampler).addChannel(target.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(newSampler));
    used++;
  }
  console.log(clip.getName(), 'rotation channels copied:', used);
}
await io.write(outFile, target);
console.log('wrote', outFile);
