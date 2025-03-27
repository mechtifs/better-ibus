'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { getIBusManager } from 'resource:///org/gnome/shell/misc/ibusManager.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getInputSourceManager } from 'resource:///org/gnome/shell/ui/status/keyboard.js';

const initSettings = (settings, entries) => {
    const getPrefValue = (name, type) => ({
        b: () => settings.get_boolean(name),
        d: () => settings.get_double(name),
        i: () => settings.get_int(name),
        s: () => settings.get_string(name),
    }[type]());
    entries.forEach(([name, type, func]) => {
        func(getPrefValue(name, type));
        settings.connect(`changed::${name}`, () => func(getPrefValue(name, type)));
    });
};

class Geometry {
    constructor(x, y, w, h) {
        Object.assign(this, {x, y, w, h});
    }

    get isValid() {
        return this.x || this.y || this.w || this.h;
    }

    equals(other) {
        return this.x === other.x && this.y === other.y && this.w === other.w && this.h === other.h;
    }
}

class Indicator extends BoxPointer.BoxPointer {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(St.Side.TOP);
        this.hintDuration = 1000;
        this.style_class = 'candidate-popup-boxpointer';
        this.visible = false;
        this._dummyCursor = new Clutter.Actor();
        Main.layoutManager.uiGroup.add_child(this._dummyCursor);
        Main.layoutManager.addTopChrome(this);
        const box = new St.BoxLayout({
            style_class: 'candidate-popup-content',
        });
        this.bin.set_child(box);
        this._label = new St.Label({
            style_class: 'candidate-popup-text',
        });
        box.add_child(this._label);
    }

    animate(text) {
        this._label.text = text;
        if (this._timeoutId) {
            return;
        }
        this.open(BoxPointer.PopupAnimation.FULL);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.hintDuration, () => {
            this.close(BoxPointer.PopupAnimation.FULL);
            this._timeoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    disrupt() {
        if (!this._timeoutId) {
            return;
        }
        GLib.source_remove(this._timeoutId);
        this._timeoutId = null;
        this.close(BoxPointer.PopupAnimation.NONE);
    }

    setGeometry(g) {
        this._dummyCursor.set_position(g.x, g.y);
        this._dummyCursor.set_size(g.w, g.h);
        this.setPosition(this._dummyCursor, 0);
        this.get_parent()?.set_child_below_sibling(this, Main.layoutManager.keyboardBox);
    }

    destroy() {
        this.disrupt();
        Main.layoutManager.removeChrome(this);
        Main.layoutManager.uiGroup.remove_child(this._dummyCursor);
        super.destroy();
    }
}

export default class BetterIBusExtension extends Extension {
    _checkGeometry(g) {
        return g.isValid && !g.equals(this._lastGeometry);
    }

    _showIndicator(g) {
        this._indicator.disrupt();
        this._indicator.setGeometry(g);
        this._indicator.animate(Main.panel.statusArea.keyboard._indicatorLabels[this._inputSourceManager.currentSource.index].get_text())
        this._lastGeometry = g;
    }

    _toggleAutoSwitch(enabled) {
        if (!enabled) {
            Main.overview.disconnectObject(this);
            return;
        }
        Main.overview.connectObject(
            'showing', () => {
                this._prevSource = this._inputSourceManager.currentSource.index;
                this._inputSourceManager.inputSources[0].activate();
                this._indicator.disrupt();
            },
            'hiding', () => {
                this._inputSourceManager.inputSources[this._prevSource ?? 0].activate();
                this._indicator.disrupt();
            },
            this
        );
    }

    _toggleShowHint(enabled) {
        if (!enabled) {
            this._panelService.disconnectObject(this);
            this._inputSourceManager.disconnectObject(this);
            global.display.disconnectObject(this);
            this._indicator?.destroy();
            this._indicator = null;
            if (this._focusTimeoutId) {
                GLib.source_remove(this._focusTimeoutId);
                this._focusTimeoutId = null;
            }
            return;
        }
        this._indicator = new Indicator();
        this._panelService.connectObject(
            'set-cursor-location', (_, x, y, w, h) => {
                this._geometry = new Geometry(x, y, w, h);
                if (this._notYetFocused && this._checkGeometry(this._geometry)) {
                    this._notYetFocused = false;
                    this._showIndicator(this._geometry);
                }
            },
            'set-cursor-location-relative', (_, x, y, w, h) => {
                const wActor = global.display.focus_window?.get_compositor_private();
                if (!wActor) {
                    return;
                }
                this._geometry = new Geometry(wActor.x + x, wActor.y + y, w, h);
                if (this._notYetFocused && this._checkGeometry(this._geometry)) {
                    this._notYetFocused = false;
                    this._showIndicator(this._geometry);
                }
            },
            this
        );
        this._inputSourceManager.connectObject(
            'current-source-changed', () => {
                if (this._geometry.isValid) {
                    this._showIndicator(this._geometry);
                }
            },
            this
        );
        global.display.connectObject(
            'notify::focus-window', () => {
                if (this._focusTimeoutId) {
                    return;
                }
                this._focusTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                    (() => {
                        const w = global.display.focus_window?.get_id();
                        if (w && w === this._lastWindowId) {
                            return;
                        }
                        this._lastWindowId = w;
                        if (!this._checkGeometry(this._geometry)) {
                            this._notYetFocused = true;
                            return;
                        }
                        this._showIndicator(this._geometry);
                    })();
                    this._focusTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                });
            },
            this
        );
    }

    enable() {
        this._geometry = new Geometry(0, 0, 0, 0);
        this._lastGeometry = new Geometry(0, 0, 0, 0);
        this._indicator = new Indicator();
        this._panelService = getIBusManager()._panelService;
        this._inputSourceManager = getInputSourceManager();
        this._settings = this.getSettings();
        initSettings(this._settings, [
            ['auto-switch', 'b', (v) => this._toggleAutoSwitch(v)],
            ['show-hint', 'b', (v) => this._toggleShowHint(v)],
            ['hint-duration', 'i', (v) => { this._indicator.hintDuration = v; }],
        ]);
    }

    disable() {
        Main.overview.disconnectObject(this);
        this._panelService.disconnectObject(this);
        this._inputSourceManager.disconnectObject(this);
        global.display.disconnectObject(this);
        this._geometry = null;
        this._lastGeometry = null;
        this._indicator?.destroy();
        this._indicator = null;
        if (this._focusTimeoutId) {
            GLib.source_remove(this._focusTimeoutId);
            this._focusTimeoutId = null;
        }
        this._panelService = null;
        this._inputSourceManager = null;
        this._settings = null;
    }
}
