// SPDX-FileCopyrightText: 2018-2019 Eon S. Jeon <esjeon@hyunmu.am>
// SPDX-FileCopyrightText: 2021 Mikhail Zolotukhin <mail@genda.life>
//
// SPDX-License-Identifier: MIT

import { Engine, TilingEngine } from "../engine";
import Window from "../engine/window";
import { WindowState } from "../engine/window";

import { DriverContext, KWinDriver } from "../driver";
import { DriverSurface } from "../driver/surface";

import Config from "../config";
import { Log } from "../util/log";

import * as Action from "./action";

/**
 * Entry point of the script (apart from QML). Handles the user input (shortcuts)
 * and the events from the Driver (in other words KWin, the window manager/compositor).
 * Provides interface for the Engine to ask Driver about particular properties of the user
 * interface.
 *
 * Basically an adapter type controller from MVA pattern.
 */
export interface Controller {
  /**
   * A bunch of surfaces, that represent the user's screens.
   */
  readonly screens: DriverSurface[];
  /**
   * Current active window. In other words the window, that has focus.
   */
  currentWindow: Window | null;

  /**
   * Current screen. In other words the screen, that has focus.
   */
  currentSurface: DriverSurface;

  /**
   * Show a popup notification in the center of the screen.
   * @param text notification text
   */
  showNotification(text: string): void;

  /**
   * React to screen focus change
   */
  onCurrentSurfaceChanged(): void;

  /**
   * React to screen update. For example, when the new screen has connected.
   * @param comment the metadata string about the details of what has changed
   */
  onSurfaceUpdate(comment: string): void;

  /**
   * React to window geometry update
   * @param window the window whose geometry has changed
   */
  onWindowGeometryChanged(window: Window): void;

  /**
   * React to window resizing
   * @param window the window which is resized
   */
  onWindowResize(window: Window): void;

  /**
   * React to window resize operation start. The window
   * resize operation is started, when the users drags
   * the window with the mouse by the window edges.
   * @param window the window which is being resized
   */
  onWindowResizeStart(window: Window): void;

  /**
   * React to window resize operation end. The window
   * resize operation ends, when the users drops
   * the window.
   * @param window the window which was dropped
   */
  onWindowResizeOver(window: Window): void;

  /**
   * React to window addition
   * @param window new added window
   */
  onWindowAdded(window: Window): void;

  /**
   * React to window removal
   * @param window the window which was removed
   */
  onWindowRemoved(window: Window): void;

  /**
   * React to window maximization state change
   * @param window the window whose maximization state changed
   * @param maximized new maximization state
   */
  onWindowMaximizeChanged(window: Window, maximized: boolean): void;

  // TODO: add docs
  onWindowChanged(window: Window | null, comment?: string): void;

  /**
   * React to window being moved.
   * @param window the window, which it being moved.
   */
  onWindowMove(window: Window): void;

  /**
   * React to window move operation start. The move operation starts
   * when the user starts dragging the window with the mouse with
   * the mouse's button being pressed
   * @param window the window which is being dragged
   */
  onWindowMoveStart(window: Window): void;

  /**
   * React to window move operation over. The move operation ends
   * when the user stops dragging the window with the mouse with
   * the mouse's button being released.
   * @param window the window which was being dragged
   */
  onWindowMoveOver(window: Window): void;

  /**
   * React to the window gaining focus, attention and love it deserves ❤️
   * @param window the window which received the focus
   */
  onWindowFocused(window: Window): void;

  /**
   * React to the window shade state change
   * @param window the window whose state was changed
   */
  onWindowShadeChanged(window: Window): void;

  /**
   * Ask engine to manage the window
   * @param win the window which needs to be managed.
   */
  manageWindow(win: Window): void;
}

export class TilingController implements Controller {
  private engine: Engine;
  private driver: DriverContext;
  public constructor(
    qmlObjects: Bismuth.Qml.Main,
    kwinApi: KWin.Api,
    private config: Config,
    private log: Log
  ) {
    this.engine = new TilingEngine(this, config, log);
    this.driver = new KWinDriver(qmlObjects, kwinApi, this, config, log);
  }

  /**
   * Entry point: start tiling window management
   */
  public start(): void {
    this.log.log("Let's get down to bismuth!");
    this.log.log(`Config: ${this.config}`);

    this.driver.bindEvents();
    this.bindShortcuts();

    this.driver.manageWindows();

    this.engine.arrange();
  }

  public get screens(): DriverSurface[] {
    return this.driver.screens;
  }

  public get currentWindow(): Window | null {
    return this.driver.currentWindow;
  }

  public set currentWindow(value: Window | null) {
    this.driver.currentWindow = value;
  }

  public get currentSurface(): DriverSurface {
    return this.driver.currentSurface;
  }

  public set currentSurface(value: DriverSurface) {
    this.driver.currentSurface = value;
  }

  public showNotification(text: string): void {
    this.driver.showNotification(text);
  }

  public onSurfaceUpdate(comment: string): void {
    this.log.log(["onSurfaceUpdate", { comment }]);
    this.engine.arrange();
  }

  public onCurrentSurfaceChanged(): void {
    this.log.log(["onCurrentSurfaceChanged", { srf: this.currentSurface }]);
    this.engine.arrange();
    /* HACK: minimize others and change geometry with Monocle Layout and
     * config.monocleMinimizeRest
     */
    if (this.currentWindow) {
      this.onWindowFocused(this.currentWindow);
    }
  }

  public onWindowAdded(window: Window): void {
    this.log.log(["onWindowAdded", { window }]);
    this.engine.manage(window);

    /* move window to next surface if the current surface is "full" */
    if (window.tileable) {
      const srf = this.currentSurface;
      const tiles = this.engine.windows.getVisibleTiles(srf);
      const layoutCapacity = this.engine.layouts.getCurrentLayout(srf).capacity;
      if (layoutCapacity !== undefined && tiles.length > layoutCapacity) {
        const nextSurface = this.currentSurface.next();
        if (nextSurface) {
          // (window.window as KWinWindow).client.desktop = (nextSurface as KWinSurface).desktop;
          window.surface = nextSurface;
          this.currentSurface = nextSurface;
        }
      }
    }

    this.engine.arrange();
  }

  public onWindowRemoved(window: Window): void {
    this.log.log(["onWindowRemoved", { window }]);

    this.engine.unmanage(window);
    this.engine.arrange();

    // Switch to next window if monocle with config.monocleMinimizeRest
    if (!this.currentWindow && this.engine.isLayoutMonocleAndMinimizeRest()) {
      this.engine.focusOrder(1, true);
      /* HACK: force window to maximize if it isn't already
       * This is ultimately to trigger onWindowFocused() at the right time
       */
      this.engine.focusOrder(1, true);
      this.engine.focusOrder(-1, true);
    }
  }

  public onWindowMoveStart(_window: Window): void {
    /* do nothing */
  }

  public onWindowMove(_window: Window): void {
    /* do nothing */
  }

  public onWindowMoveOver(window: Window): void {
    this.log.log(["onWindowMoveOver", { window }]);

    /* swap window by dragging */
    if (window.state === WindowState.Tiled) {
      const tiles = this.engine.windows.getVisibleTiles(this.currentSurface);
      const windowCenter = window.actualGeometry.center;

      const targets = tiles.filter(
        (tile) =>
          tile !== window && tile.actualGeometry.includesPoint(windowCenter)
      );

      if (targets.length === 1) {
        this.engine.windows.swap(window, targets[0]);
        this.engine.arrange();
        return;
      }
    }

    /* ... or float window by dragging */
    if (window.state === WindowState.Tiled) {
      const diff = window.actualGeometry.subtract(window.geometry);
      const distance = Math.sqrt(diff.x ** 2 + diff.y ** 2);
      // TODO: arbitrary constant
      if (distance > 30) {
        window.floatGeometry = window.actualGeometry;
        window.state = WindowState.Floating;
        this.engine.arrange();
        return;
      }
    }

    /* ... or return to the previous position */
    window.commit();
  }

  public onWindowResizeStart(_window: Window): void {
    /* do nothing */
  }

  public onWindowResize(window: Window): void {
    this.log.log(["onWindowResize", { window }]);
    if (this.config.adjustLayout && this.config.adjustLayoutLive) {
      if (window.state === WindowState.Tiled) {
        this.engine.adjustLayout(window);
        this.engine.arrange();
      }
    }
  }

  public onWindowResizeOver(window: Window): void {
    this.log.log(["onWindowResizeOver", { window }]);
    if (this.config.adjustLayout && window.tiled) {
      this.engine.adjustLayout(window);
      this.engine.arrange();
    } else if (!this.config.adjustLayout) {
      this.engine.enforceSize(window);
    }
  }

  public onWindowMaximizeChanged(_window: Window, _maximized: boolean): void {
    this.engine.arrange();
  }

  public onWindowGeometryChanged(window: Window): void {
    this.log.log(["onWindowGeometryChanged", { window }]);
    this.engine.enforceSize(window);
  }

  // NOTE: accepts `null` to simplify caller. This event is a catch-all hack
  // by itself anyway.
  public onWindowChanged(window: Window | null, comment?: string): void {
    if (window) {
      this.log.log(["onWindowChanged", { window, comment }]);

      if (comment === "unminimized") {
        this.currentWindow = window;
      }

      this.engine.arrange();
    }
  }

  public onWindowFocused(window: Window): void {
    window.timestamp = new Date().getTime();
    this.currentWindow = window;
    // Minimize other windows if Monocle and config.monocleMinimizeRest
    if (
      this.engine.isLayoutMonocleAndMinimizeRest() &&
      this.engine.windows.getVisibleTiles(window.surface).includes(window)
    ) {
      /* If a window hasn't been focused in this layout yet, ensure its geometry
       * gets maximized.
       */
      this.engine
        .currentLayoutOnCurrentSurface()
        .apply(
          this,
          this.engine.windows.getAllTileables(window.surface),
          window.surface.workingArea
        );

      this.engine.minimizeOthers(window);
    }
  }

  public onWindowShadeChanged(win: Window): void {
    this.log.log(`onWindowShadeChanged, window: ${win}`);

    // NOTE: Float shaded windows and change their state back once unshaded
    // For some reason shaded windows break our tiling geometry,
    // once resized. To avoid that, we put them to floating state.
    if (win.shaded) {
      win.state = WindowState.Floating;
    } else {
      win.state = win.statePreviouslyAskedToChangeTo;
    }

    this.engine.arrange();
  }

  public manageWindow(win: Window): void {
    this.engine.manage(win);
  }

  private bindShortcuts(): void {
    const allPossibleActions = [
      new Action.FocusNextWindow(this.engine, this.log),
      new Action.FocusPreviousWindow(this.engine, this.log),
      new Action.FocusUpperWindow(this.engine, this.log),
      new Action.FocusBottomWindow(this.engine, this.log),
      new Action.FocusLeftWindow(this.engine, this.log),
      new Action.FocusRightWindow(this.engine, this.log),
      new Action.MoveActiveWindowToNextPosition(this.engine, this.log),

      new Action.MoveActiveWindowToPreviousPosition(this.engine, this.log),
      new Action.MoveActiveWindowUp(this.engine, this.log),
      new Action.MoveActiveWindowDown(this.engine, this.log),
      new Action.MoveActiveWindowLeft(this.engine, this.log),
      new Action.MoveActiveWindowRight(this.engine, this.log),

      new Action.IncreaseActiveWindowWidth(this.engine, this.log),
      new Action.IncreaseActiveWindowHeight(this.engine, this.log),
      new Action.DecreaseActiveWindowWidth(this.engine, this.log),
      new Action.DecreaseActiveWindowHeight(this.engine, this.log),

      new Action.IncreaseMasterAreaWindowCount(this.engine, this.log),
      new Action.DecreaseMasterAreaWindowCount(this.engine, this.log),
      new Action.IncreaseLayoutMasterAreaSize(this.engine, this.log),
      new Action.DecreaseLayoutMasterAreaSize(this.engine, this.log),

      new Action.ToggleActiveWindowFloating(this.engine, this.log),
      new Action.PushActiveWindowIntoMasterAreaFront(this.engine, this.log),

      new Action.SwitchToNextLayout(this.engine, this.log),
      new Action.SwitchToPreviousLayout(this.engine, this.log),
      new Action.SetTileLayout(this.engine, this.log),
      new Action.SetMonocleLayout(this.engine, this.log),
      new Action.SetThreeColumnLayout(this.engine, this.log),
      new Action.SetStairLayout(this.engine, this.log),
      new Action.SetSpreadLayout(this.engine, this.log),
      new Action.SetFloatingLayout(this.engine, this.log),
      new Action.SetQuarterLayout(this.engine, this.log),

      new Action.Rotate(this.engine, this.log),
      new Action.RotatePart(this.engine, this.log),
    ];

    for (const action of allPossibleActions) {
      this.driver.bindShortcut(action);
    }
  }
}
