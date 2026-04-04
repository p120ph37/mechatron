"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Clipboard = void 0;
function getNative() {
    const { getNativeBackend } = require("./native");
    return getNativeBackend();
}
exports.Clipboard = {
    clear() {
        return getNative().clipboard_clear();
    },
    hasText() {
        return getNative().clipboard_hasText();
    },
    getText() {
        return getNative().clipboard_getText();
    },
    setText(text) {
        if (typeof text !== "string")
            throw new TypeError("Invalid arguments");
        return getNative().clipboard_setText(text);
    },
    hasImage() {
        return getNative().clipboard_hasImage();
    },
    getImage(image) {
        const result = getNative().clipboard_getImage();
        if (!result)
            return false;
        image.destroy();
        image.create(result.width, result.height);
        const data = image.getData();
        if (data)
            data.set(result.data);
        return true;
    },
    setImage(image) {
        const data = image.getData();
        if (!data)
            return false;
        return getNative().clipboard_setImage(image.getWidth(), image.getHeight(), data);
    },
    getSequence() {
        return getNative().clipboard_getSequence();
    },
};
