import { createContext } from "react";

/**
 * True inside a layout that already draws the site header and footer, so a page rendered there
 * (an error or not-found page) does not draw a second set.
 */
export const InSiteFrame = createContext(false);
