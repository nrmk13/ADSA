import { View, type ViewProps } from "react-native";

export interface CardProps extends ViewProps {}

export const Card = (props: CardProps) => <View accessibilityRole="summary" {...props} />;
