import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ChatInput } from "../ChatInput";

/**
 * Tests for ChatInput's tap-vs-hold mic gesture and the call-active state.
 *
 * A short tap on the mic button triggers `onMicPress` (existing behaviour).
 * A 3-second hold fires `onLongPress` which calls `onMicLongPress` to start
 * a call. While `isCallActive` is true, the mic button is disabled and shows
 * a phone icon instead of the mic.
 */

jest.setTimeout(15000);

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("expo-blur", () => {
  const { View } = require("react-native");
  return { BlurView: View };
});

jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => true,
    withTiming: (v: unknown) => v,
    Easing: {
      linear: 0,
      inOut: () => () => 0,
      out: () => () => 0,
      cubic: () => 0,
    },
  };
});

const defaultProps = {
  onSend: jest.fn(),
  onMicPress: jest.fn(),
  onMicLongPress: jest.fn(),
  isRecording: false,
  isCallActive: false,
  busy: false,
};

afterEach(() => {
  jest.clearAllMocks();
});

describe("ChatInput hold-to-call gesture", () => {
  it("calls onMicPress on a short tap", () => {
    const { getByTestId } = render(<ChatInput {...defaultProps} />);
    fireEvent.press(getByTestId("mic-button"));
    expect(defaultProps.onMicPress).toHaveBeenCalledTimes(1);
    expect(defaultProps.onMicLongPress).not.toHaveBeenCalled();
  });

  it("calls onMicLongPress when onLongPress fires (3s hold)", () => {
    const { getByTestId } = render(<ChatInput {...defaultProps} />);
    fireEvent(getByTestId("mic-button"), "longPress");
    expect(defaultProps.onMicLongPress).toHaveBeenCalledTimes(1);
    expect(defaultProps.onMicPress).not.toHaveBeenCalled();
  });

  it("shows the hold-progress ring when onMicLongPress is provided", () => {
    const { getByTestId } = render(<ChatInput {...defaultProps} />);
    expect(getByTestId("mic-hold-ring")).toBeTruthy();
  });

  it("hides the hold-progress ring when onMicLongPress is not provided", () => {
    const { queryByTestId } = render(
      <ChatInput {...defaultProps} onMicLongPress={undefined} />,
    );
    expect(queryByTestId("mic-hold-ring")).toBeNull();
  });

  it("hides the hold-progress ring when isCallActive is true", () => {
    const { queryByTestId } = render(
      <ChatInput {...defaultProps} isCallActive />,
    );
    expect(queryByTestId("mic-hold-ring")).toBeNull();
  });
});

describe("ChatInput in-call state", () => {
  it("disables the mic button when isCallActive is true", () => {
    const { getByTestId } = render(
      <ChatInput {...defaultProps} isCallActive />,
    );
    const btn = getByTestId("mic-button");
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    // Tap must not fire onMicPress
    fireEvent.press(btn);
    expect(defaultProps.onMicPress).not.toHaveBeenCalled();
  });

  it("does not start a new call via long-press when already in a call", () => {
    const { getByTestId } = render(
      <ChatInput {...defaultProps} isCallActive />,
    );
    fireEvent(getByTestId("mic-button"), "longPress");
    expect(defaultProps.onMicLongPress).not.toHaveBeenCalled();
  });

  it("shows 'Call in progress' placeholder when isCallActive", () => {
    const { getByTestId } = render(
      <ChatInput {...defaultProps} isCallActive />,
    );
    expect(getByTestId("chat-input").props.placeholder).toBe(
      "Call in progress…",
    );
  });
});
