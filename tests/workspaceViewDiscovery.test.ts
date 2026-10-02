import type { App, WorkspaceLeaf } from "obsidian";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { WorkspaceInterceptor } from "../src/popout/workspaceInterceptor";
import type { PopoutLayoutEngine } from "../src/shared/popoutLayout";

function createPopoutWindow(focused: boolean): Window {
  return {
    document: {
      body: { classList: { contains: (name: string) => name === "is-popout-window" } },
      hasFocus: () => focused,
    },
  } as unknown as Window;
}

function createLeaf(win: Window): WorkspaceLeaf {
  return {
    containerEl: { ownerDocument: { defaultView: win } },
  } as unknown as WorkspaceLeaf;
}

describe("workspace view discovery", () => {
  const globalObject = globalThis as unknown as { activeWindow?: Window };
  let previousActiveWindow: Window | undefined;
  let interceptor: WorkspaceInterceptor;

  beforeEach(() => {
    previousActiveWindow = globalObject.activeWindow;
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
  });

  afterEach(() => {
    interceptor?.uninstall();
    vi.restoreAllMocks();
    if (previousActiveWindow === undefined) delete globalObject.activeWindow;
    else globalObject.activeWindow = previousActiveWindow;
  });

  function setup(viewType: string, hosts: Window[], engine?: PopoutLayoutEngine) {
    const leaves = hosts.map(createLeaf);
    const workspace = {
      getLeftLeaf: vi.fn().mockReturnValue(null),
      getRightLeaf: vi.fn().mockReturnValue(null),
      getLeavesOfType: vi.fn(function (this: unknown, type: string): WorkspaceLeaf[] {
        expect(this).toBe(workspace);
        return type === viewType ? leaves : [];
      }),
    };
    const originalLookup = workspace.getLeavesOfType;
    interceptor = new WorkspaceInterceptor({ workspace } as unknown as App, engine);
    interceptor.install();
    return { workspace, leaves, originalLookup };
  }

  test.each(["vertical-tabs", "custom-singleton-view"])(
    "layout reconciliation keeps the existing %s panel when a popout is focused",
    (viewType) => {
      globalObject.activeWindow = createPopoutWindow(true);
      const { workspace, leaves, originalLookup } = setup(viewType, [window]);
      const createPanel = vi.fn();

      // A singleton plugin checks for its panel on each layout-change event.
      // Focusing a popout must not make that existing panel disappear.
      for (let event = 0; event < 3; event++) {
        if (workspace.getLeavesOfType(viewType).length === 0) createPanel();
      }

      expect(createPanel).not.toHaveBeenCalled();
      expect(workspace.getLeavesOfType(viewType)).toBe(leaves);
      expect(originalLookup).toHaveBeenCalledWith(viewType);
    }
  );

  test("preserves panels in the main window and another popout when the active window has none", () => {
    globalObject.activeWindow = createPopoutWindow(true);
    const otherPopout = createPopoutWindow(false);
    const { workspace, leaves } = setup("custom-view", [otherPopout, window]);

    expect(workspace.getLeavesOfType("custom-view")).toBe(leaves);
  });

  test.each(["outline", "grid-view", "custom-view"])(
    "prefers all local %s panels without returning panels in other windows",
    (viewType) => {
      const popout = createPopoutWindow(true);
      globalObject.activeWindow = popout;
      const { workspace, leaves } = setup(viewType, [window, popout, popout, createPopoutWindow(false)]);

      expect(workspace.getLeavesOfType(viewType)).toEqual([leaves[1], leaves[2]]);
    }
  );

  test("still reports no panels for a view that does not exist anywhere", () => {
    globalObject.activeWindow = createPopoutWindow(true);
    const { workspace } = setup("existing-view", [window]);

    expect(workspace.getLeavesOfType("missing-view")).toEqual([]);
  });

  test("explicit sidebar creation opens a local outline despite discovering the main-window outline", async () => {
    const popout = createPopoutWindow(true);
    globalObject.activeWindow = popout;
    const localOutline = {
      ...createLeaf(popout),
      setViewState: vi.fn().mockResolvedValue(undefined),
      loadIfDeferred: vi.fn().mockResolvedValue(undefined),
    };
    const engine = {
      getColumnElement: vi.fn().mockReturnValue(null),
      openSideLeafSync: vi.fn().mockReturnValue(localOutline),
    };
    const { workspace, leaves } = setup("outline", [window], engine as unknown as PopoutLayoutEngine);
    const mainOutline = leaves[0];
    localOutline.setViewState.mockImplementation(async () => {
      leaves.push(localOutline as unknown as WorkspaceLeaf);
    });

    expect(workspace.getLeavesOfType("outline")).toEqual([mainOutline]);
    const managedWorkspace = workspace as unknown as {
      ensureSideLeaf(type: string, side: "left" | "right"): Promise<WorkspaceLeaf>;
    };
    const created = await managedWorkspace.ensureSideLeaf("outline", "right");

    expect(created).toBe(localOutline);
    expect(engine.openSideLeafSync).toHaveBeenCalledWith(popout, "right");
    expect(localOutline.setViewState).toHaveBeenCalledWith({
      type: "outline", active: undefined, state: undefined,
    });
    expect(leaves).toContain(mainOutline);
    expect(workspace.getLeavesOfType("outline")).toEqual([localOutline]);
  });

  test.each(["main-window focus", "disabled routing", "unmanaged popout"])(
    "keeps the original lookup results with %s",
    (scenario) => {
      const popout = createPopoutWindow(true);
      globalObject.activeWindow = popout;
      const { workspace, leaves } = setup("outline", [window, popout]);
      if (scenario === "main-window focus") vi.mocked(document.hasFocus).mockReturnValue(true);
      if (scenario === "disabled routing") interceptor.enabled = false;
      if (scenario === "unmanaged popout") interceptor.isManagedWindow = () => false;

      expect(workspace.getLeavesOfType("outline")).toBe(leaves);
    }
  );

  test("restores the original workspace lookup when the interceptor is unloaded", () => {
    globalObject.activeWindow = createPopoutWindow(true);
    const { workspace, leaves, originalLookup } = setup("custom-view", [window]);

    interceptor.uninstall();

    expect(workspace.getLeavesOfType).toBe(originalLookup);
    expect(workspace.getLeavesOfType("custom-view")).toBe(leaves);
  });
});
