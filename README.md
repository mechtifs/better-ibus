# Better IBus

Better IBus is a GNOME Shell extension which adds some QoL improvements to the IBus input framework for multilingual users. As for now, it contains two major features:
- Temporarily switch to primary input source when entering the overview, which solves the conflict between the IBus popup and the "Type to search" feature
- Show a input source hint when focusing on text fields or switching input sources (which is hugely inspired by [Customize IBus](https://github.com/openSUSE/Customize-IBus))

## Known Issues

- The hint popup may appear in wrong position. This is caused by IBus not updating cursor position in time
- Electron apps are not supported by now

## Installation

### E.G.O

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

## Screenshots

![Demonstration](https://github.com/user-attachments/assets/8cde2810-4dc2-4f15-8e8c-1ad5888cbb6c)
![Preference](https://github.com/user-attachments/assets/d50f9630-1609-4f51-a3f1-ace9248e5c5d)

[EGO]:https://extensions.gnome.org/extension/7278/better-ibus/
