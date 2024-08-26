'use strict';

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences, gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const _ = (text) => (text === null ? null : gettext(text));

const nSpin = (title, subtitle, lower, upper, step_increment) => new Adw.SpinRow({
    title: _(title),
    subtitle: _(subtitle),
    numeric: true,
    adjustment: new Gtk.Adjustment({ lower, upper, step_increment }),
});

const nSwitch = (title, subtitle) => new Adw.SwitchRow({
    title: _(title),
    subtitle: _(subtitle),
});

class PrefGroup extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor(title, description, rows) {
        super({
            title: _(title),
            description: _(description),
        });
        this._rows = rows;
    }

    bind(settings) {
        this._rows.forEach(([key, obj]) => {
            const prop = {
                Adw_ComboRow: 'selected',
                Adw_EntryRow: 'text',
                Adw_SpinRow: 'value',
                Adw_SwitchRow: 'active',
            }[obj.constructor.name];
            this.add(obj);
            settings.bind(key, obj, prop, Gio.SettingsBindFlags.DEFAULT);
        });
    }
}

class PrefPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(title, icon_name, groups) {
        super({
            title: _(title),
            icon_name,
        });
        this._groups = groups;
    }

    bind(settings) {
        this._groups.forEach((group) => {
            group.bind(settings);
            this.add(group);
        });
    }
}

export default class BetterIBusPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_title(gettext('Better IBus Preferences'));
        const _settings = this.getSettings();

        const _appearancePage = new PrefPage(null, null, [
            new PrefGroup('Overview', 'Configure IBus behavior in the overview.', [
                ["auto-switch", nSwitch('Auto Switch', 'Temporarily switch to the primary input source when entering the overview.')],
            ]),
            new PrefGroup('Input Source Hint', 'Configure the input source hint', [
                ["show-hint", nSwitch('Show Hint', 'Enable the input source hint when focusing an input field and switching input sources.')],
                ["hint-duration", nSpin('Hint Duration', 'Configure the duration of the hint popup.', 50, 5000, 1)],
            ]),
        ]);

        _appearancePage.bind(_settings);
        window.add(_appearancePage);
    }
}
