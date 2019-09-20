import { debugStream, debugBehavior } from "./src";
import { time, sinkStream } from "@funkia/hareactive";

const s = sinkStream();

debugBehavior({ original: time, hijacked: false });
debugStream({ original: s, hijacked: true });
setTimeout(() => {}, 1000);
s.push("asd");
