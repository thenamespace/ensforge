import { afterEach } from "@effect/vitest";

import { cleanup } from "@testing-library/react";

// testing-library unmounts after each test only when vitest's globals are on, and they are off
// here. A tree left mounted keeps its reads subscribed, and React can then render one after the
// test environment is torn down ("window is not defined").
afterEach(() => cleanup());
