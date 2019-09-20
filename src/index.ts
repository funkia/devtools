import * as H from "@funkia/hareactive";
import {
  runComponent,
  elements as E,
  component,
  toComponent,
  view,
  Component
} from "@funkia/turbine";
import { withEffects, IO } from "@funkia/jabz";
import "./style.scss";

export type ValueType = "string" | "number" | "json";

type StreamDesc<A> = {
  opts: DebugStreamOptions<A>;
  reactive: H.Stream<A>;
  shiftTo: (s: H.Stream<A>) => IO<any>;
};

type BehaviorDesc<A> = {
  opts: DebugBehaviorOptions<A>;
  reactive: H.Behavior<A>;
  switchTo: (b: H.Behavior<A>) => IO<any>;
};

const KEYCODE_ENTER = 13;

const send = "➼";

const newStreamDesc = H.sinkStream<StreamDesc<any>>();
const newBehaviorDesc = H.sinkStream<BehaviorDesc<any>>();

function collecting<A>(add: H.Stream<A>) {
  return H.accum((desc, acc) => [...acc, desc], <A[]>[], add);
}

type SendInputOn = {
  value: H.Behavior<string>;
  push: H.Stream<any>;
};

const sendInput = (
  type: ValueType,
  disabled: H.Behavior<boolean> = H.Behavior.of(false)
) =>
  component<SendInputOn, { toSend: H.Stream<any> }>(on => {
    const toPush = H.snapshot(on.value, on.push);
    const toSend = toPush.map(str =>
      type === "number"
        ? parseFloat(str)
        : type === "json"
        ? JSON.parse(str)
        : str
    );
    return E.div({ class: "send-input-container" }, [
      E.input({
        class: "send-input",
        value: toSend.mapTo(""),
        type: type === "number" ? "number" : "text",
        disabled,
        autocomplete: "off"
      }).use(o => ({
        value: o.value,
        push: o.keyup.filter(ev => ev.keyCode === KEYCODE_ENTER)
      })),
      E.div({ class: "send-btn" }, send).use({ push: "click" })
    ]).output({ toSend });
  });

const check = (titel: string, checked?: H.Behavior<boolean> | boolean) =>
  view(
    E.div({ class: "checkbox-container" }, [
      E.label(titel),
      E.checkbox({ props: { checked } }).use({
        checked: "checked",
        checkedChange: "checkedChange"
      })
    ])
  );

type StreamViewOn = {
  toSend: H.Stream<any>;
  hijackChange: H.Stream<boolean>;
};

const streamView = (desc: StreamDesc<any>) =>
  component<StreamViewOn>((on, start) => {
    const noOriginal = desc.opts.original === undefined;
    const { name = "Unnamed", type = "string", hijacked = false } = desc.opts;
    const sink = H.sinkStream();
    const combined = noOriginal ? sink : H.combine(sink, desc.opts.original);
    const lastValue = start(
      H.stepper("<none>", desc.reactive.map(a => a.toString()))
    );
    if (noOriginal || desc.opts.hijacked === true) {
      start(H.performIO(desc.shiftTo(sink)));
    } else {
      start(H.performIO(desc.shiftTo(combined)));
    }
    start(
      H.performStream(
        on.hijackChange.map(hijacked =>
          desc.shiftTo(hijacked ? sink : combined)
        )
      )
    );
    start(H.performStream(on.toSend.map(withEffects(v => sink.push(v)))));

    return E.div({ class: "reactive-view" }, [
      E.div({ class: "reactive-desc" }, [
        E.span({ class: "reactive-name" }, `${name}<${type}>`),
        E.span({ class: "reactive-value" }, lastValue)
      ]),
      noOriginal
        ? Component.of({}).use(() => ({ hijackChange: H.empty }))
        : check("Hijack", hijacked).use({
            hijackChange: "checkedChange"
          }),
      sendInput(type).use({ toSend: "toSend" })
    ]);
  });

type BehaviorViewOn = {
  toSend: H.Stream<any>;
  hijackChange: H.Stream<boolean>;
};
const behaviorView = <A>(desc: BehaviorDesc<A>) =>
  component<BehaviorViewOn>((on, plz) => {
    const noOriginal = desc.opts.original === undefined;
    const {
      name = "Unnamed",
      type = "string",
      initial = "",
      hijacked = false
    } = desc.opts;
    const hijacks = H.combine(on.toSend.mapTo(true), on.hijackChange);
    const isHijacked = plz(H.stepper(hijacked, hijacks));
    const sink = H.sinkBehavior<A>(<any>initial);
    if (noOriginal || desc.opts.hijacked === true) {
      plz(H.performIO(desc.switchTo(sink)));
    }
    plz(
      H.performStream(
        hijacks.map(hijack => desc.switchTo(hijack ? sink : desc.opts.original))
      )
    );
    plz(H.performStream(on.toSend.map(withEffects(v => sink.push(v)))));

    return E.div({ class: "reactive-view" }, [
      E.div({ class: "reactive-desc" }, [
        E.span({ class: "reactive-name" }, `${name}<${type}>`),
        E.span(
          { class: "reactive-value" },
          desc.reactive.map(a => a.toString())
        )
      ]),
      noOriginal
        ? Component.of({}).use(() => ({ hijackChange: H.empty }))
        : check("Hijack", isHijacked).use({ hijackChange: "checkedChange" }),
      sendInput(type).use({ toSend: "toSend" })
    ]);
  });

const main = component<{ toggle: H.Stream<any> }>((on, start) => {
  const streams = start(collecting(newStreamDesc));
  const behaviors = start(collecting(newBehaviorDesc));
  const hidePanel = start(H.accum((_, status) => !status, false, on.toggle));
  return E.div({ class: ["container", { "hide-panel": hidePanel }] }, [
    E.div({ class: "toggle-btn" }).use({ toggle: "click" }),
    E.div({ class: "panel" }, [
      E.div({ class: { hide: streams.map(ss => ss.length === 0) } }, [
        E.h3("Streams"),
        E.ul(streams.map(ss => toComponent(ss.map(d => E.li(streamView(d))))))
      ]),
      E.div({ class: { hide: behaviors.map(ss => ss.length === 0) } }, [
        E.h3("Behaviors"),
        E.ul(
          behaviors.map(ss => toComponent(ss.map(d => E.li(behaviorView(d)))))
        )
      ])
    ])
  ]);
});

type SetupOptions = {};
let isSetup = false;
export function setup(opts: SetupOptions = {}) {
  if (isSetup) {
    return;
  }
  const div = document.createElement("div");
  document.body.appendChild(div);
  isSetup = true;
  runComponent(div, main);
}

export type DebugStreamOptions<A> = {
  name?: string;
  type?: ValueType;
  original?: H.Stream<A>;
  hijacked?: boolean;
};

export function debugStream<A>(opts: DebugStreamOptions<A> = {}): H.Stream<A> {
  setup();
  const sink = H.sinkStream<H.Stream<A>>();
  const reactive = H.runNow(H.shift<A>(sink));
  newStreamDesc.push({
    opts,
    reactive,
    shiftTo: withEffects((value: H.Stream<A>) => {
      sink.push(value);
    })
  });
  return reactive;
}

export type DebugBehaviorOptions<A> = {
  name?: string;
  type?: ValueType;
  initial?: A;
  original?: H.Behavior<A>;
  hijacked?: boolean;
};
export function debugBehavior<A>(opts: DebugBehaviorOptions<A>): H.Behavior<A> {
  setup();
  const init =
    "original" in opts && opts.original !== undefined
      ? opts.original
      : H.Behavior.of((<any>opts).initial);
  const sink = H.sinkStream<H.Behavior<A>>();
  const reactive = H.runNow(H.switcher(init, sink));
  newBehaviorDesc.push({
    opts,
    reactive,
    switchTo: withEffects((value: H.Behavior<A>) => {
      sink.push(value);
    })
  });
  return reactive;
}
