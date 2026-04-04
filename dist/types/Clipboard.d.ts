import { Image } from "./Image";
export declare const Clipboard: {
    clear(): boolean;
    hasText(): boolean;
    getText(): string;
    setText(text: string): boolean;
    hasImage(): boolean;
    getImage(image: Image): boolean;
    setImage(image: Image): boolean;
    getSequence(): number;
};
