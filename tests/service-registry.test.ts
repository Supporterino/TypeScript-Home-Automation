import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { CoreContext, ServicePlugin } from "../src/core/services/service-plugin.js";
import { ServiceRegistry } from "../src/core/services/service-registry.js";

const logger = pino({ level: "silent" });

interface FakeService {
  doWork: () => string;
}

function makeFake(value = "ok"): FakeService {
  return { doWork: () => value };
}

function makeCoreContext(): CoreContext {
  return { http: {} as unknown as CoreContext["http"], logger, deviceRegistry: null };
}

describe("ServiceRegistry", () => {
  describe("get", () => {
    it("returns null when service is not registered", () => {
      const registry = new ServiceRegistry();
      expect(registry.get("missing")).toBeNull();
    });

    it("returns the registered service", () => {
      const registry = new ServiceRegistry();
      const svc = makeFake();
      registry.register("svc", svc);
      expect(registry.get<FakeService>("svc")).toBe(svc);
    });
  });

  describe("getOrThrow", () => {
    it("returns the registered service without null-check", () => {
      const registry = new ServiceRegistry();
      const svc = makeFake();
      registry.register("svc", svc);
      const result = registry.getOrThrow<FakeService>("svc");
      expect(result).toBe(svc);
    });

    it("throws a descriptive error when service is not registered", () => {
      const registry = new ServiceRegistry();
      expect(() => registry.getOrThrow("missing")).toThrow(`Service "missing" is not registered`);
    });

    it("error message mentions createEngine", () => {
      const registry = new ServiceRegistry();
      expect(() => registry.getOrThrow("shelly")).toThrow("createEngine");
    });
  });

  describe("use", () => {
    it("calls the callback with the service and returns its result", () => {
      const registry = new ServiceRegistry();
      const svc = makeFake("hello");
      registry.register("svc", svc);
      const result = registry.use<FakeService, string>("svc", (s) => s.doWork());
      expect(result).toBe("hello");
    });

    it("returns undefined when the service is not registered", () => {
      const registry = new ServiceRegistry();
      const fn = mock(() => "called");
      const result = registry.use<FakeService, string>("missing", fn);
      expect(result).toBeUndefined();
      expect(fn).not.toHaveBeenCalled();
    });

    it("does not call the callback when the service is absent", () => {
      const registry = new ServiceRegistry();
      const fn = mock((_s: FakeService) => "x");
      registry.use<FakeService, string>("absent", fn);
      expect(fn).toHaveBeenCalledTimes(0);
    });

    it("forwards async callbacks and returns the promise", async () => {
      const registry = new ServiceRegistry();
      const svc = makeFake("async-result");
      registry.register("svc", svc);
      const result = await registry.use<FakeService, Promise<string>>("svc", (s) =>
        Promise.resolve(s.doWork()),
      );
      expect(result).toBe("async-result");
    });

    it("composes with ?? to provide a fallback", () => {
      const registry = new ServiceRegistry();
      const result = registry.use<FakeService, boolean>("missing", () => true) ?? false;
      expect(result).toBe(false);
    });
  });

  describe("plugin lifecycle", () => {
    it("continues past a hanging plugin onStart after the timeout", async () => {
      // Short timeout so the test does not hang on the never-settling plugin.
      const registry = new ServiceRegistry(50);
      registry.setLogger(logger);

      const hanging: ServicePlugin = {
        serviceKey: "hanging",
        onStart: () => new Promise<void>(() => {}), // never resolves
      };
      let secondStarted = false;
      const second: ServicePlugin = {
        serviceKey: "second",
        onStart: async () => {
          secondStarted = true;
        },
      };
      registry.register("hanging", hanging);
      registry.register("second", second);

      await registry.startAll(makeCoreContext());

      expect(secondStarted).toBe(true);
    });

    it("stops plugins in reverse registration order", async () => {
      const registry = new ServiceRegistry();
      registry.setLogger(logger);

      const order: string[] = [];
      const makePlugin = (key: string): ServicePlugin => ({
        serviceKey: key,
        onStop: async () => {
          order.push(key);
        },
      });
      registry.register("a", makePlugin("a"));
      registry.register("b", makePlugin("b"));
      registry.register("c", makePlugin("c"));

      await registry.stopAll();

      expect(order).toEqual(["c", "b", "a"]);
    });

    it("continues past a hanging plugin onStop after the timeout", async () => {
      const registry = new ServiceRegistry(50);
      registry.setLogger(logger);

      let firstStopped = false;
      const first: ServicePlugin = {
        serviceKey: "first",
        onStop: async () => {
          firstStopped = true;
        },
      };
      const hanging: ServicePlugin = {
        serviceKey: "hanging",
        onStop: () => new Promise<void>(() => {}), // never resolves
      };
      // Registered first -> hanging; reverse stop order means hanging stops
      // first (times out), then first still stops.
      registry.register("first", first);
      registry.register("hanging", hanging);

      await registry.stopAll();

      expect(firstStopped).toBe(true);
    });
  });
});
