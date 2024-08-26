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
        'b': () => settings.get_boolean(name),
        'd': () => settings.get_double(name),
        'i': () => settings.get_int(name),
        's': () => settings.get_string(name),
    }[type]());
    entries.forEach(([name, type, func]) => {
        func(getPrefValue(name, type));
        settings.connect(`changed::${name}`, () => func(getPrefValue(name, type)));
    });
};

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
        Main.layoutManager.uiGroup.add_child(this);
        const box = new St.BoxLayout({
            style_class: 'candidate-popup-content',
        });
        this.bin.set_child(box);
        this._inputIndicatorLabel = new St.Label({
            style_class: 'candidate-popup-text',
        });
        box.add_child(this._inputIndicatorLabel);
    }

    showIndicator(text) {
        this._inputIndicatorLabel.text = text;
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
            this.close(BoxPointer.PopupAnimation.NONE);
        }
        this.open(BoxPointer.PopupAnimation.FULL);
        this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.hintDuration, () => {
            this.close(BoxPointer.PopupAnimation.FULL);
            this._timeout = null;
            return false;
        });
    }

    updateGeometry(geometry) {
        this._dummyCursor.set_position(geometry.x, geometry.y);
        this._dummyCursor.set_size(geometry.w, geometry.h);
        this.setPosition(this._dummyCursor, 0);
        this.get_parent().set_child_below_sibling(this, Main.layoutManager.keyboardBox);
    }
}

export default class HasslelessOverviewSearchExtension extends Extension {
    _checkValidity(geometry) {
        return Object.values(geometry).reduce((a, b) => a | b);
    }

    _showSourceIndicator() {
        this._indicator.showIndicator(Main.panel.statusArea.keyboard._indicatorLabels[this._inputSourceManager.currentSource.index].get_text());
    }

    _checkHasUnfocusedOnce() {
        const isValid = this._checkValidity(this._geometry);
        if (isValid) {
            this._lastKnownValidGeometry = this._geometry;
        }
        this._hasUnfocusedOnce |= !isValid;
    }

    _toggleAutoSwitch(enabled) {
        Main.overview.disconnectObject(this);
        if (!enabled) {
            return;
        }
        Main.overview.connectObject(
            'showing', () => {
                this._prevSource = this._inputSourceManager.currentSource.index;
                this._inputSourceManager.inputSources[0].activate();
            },
            'hiding', () => {
                this._inputSourceManager.inputSources[this._prevSource].activate();
            },
            this
        );
    }

    _toggleShowHint(enabled) {
        this._panelService.disconnectObject(this);
        if (!enabled) {
            return;
        }
        this._panelService.connectObject(
            'set-cursor-location', (_, x, y, w, h) => {
                this._cursorLocationChangeTime = GLib.get_monotonic_time();
                this._geometry = { x, y, w, h };
                this._checkHasUnfocusedOnce();
            },
            "set-cursor-location-relative", (_, x, y, w, h) => {
                if (!global.display.focus_window) {
                    return;
                }
                const window = global.display.focus_window.get_compositor_private();
                this._cursorLocationChangeTime = GLib.get_monotonic_time();
                this._geometry = { x: window.x+x, y: window.y+y, w, h };
                this._checkHasUnfocusedOnce();
            },
            'focus-in', () => {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                    if (Math.abs(GLib.get_monotonic_time() - this._cursorLocationChangeTime) < 20000 && this._checkValidity(this._geometry)) {
                        this._indicator.updateGeometry(this._lastKnownValidGeometry);
                        if (!this._hasUnfocusedOnce) {
                            return;
                        }
                        this._hasUnfocusedOnce = false;
                        this._showSourceIndicator();
                    }
                    return false;
                });
            },
            this
        );
    }

    enable() {
        this._indicator = new Indicator();
        this._hasUnfocusedOnce = true;
        this._panelService = getIBusManager()._panelService;
        this._inputSourceManager = getInputSourceManager();
        this._settings = this.getSettings();
        initSettings(this._settings, [
            ['auto-switch', 'b', (v) => this._toggleAutoSwitch(v)],
            ['show-hint', 'b', (v) => this._toggleShowHint(v)],
            ['hint-duration', 'i', (v) => {this._indicator.hintDuration = v}],
        ])

    }

    disable() {
        this._panelService.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._indicator = null;
        this._panelService = null;
        this._inputSourceManager = null;
        this._settings = null;
    }
}
