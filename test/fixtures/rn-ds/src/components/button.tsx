import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";

export interface ButtonProps extends PressableProps {
    label: string;
    variant?: "primary" | "secondary";
}

export const Button = ({ label, variant = "primary", ...props }: ButtonProps) => (
    <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={variant === "primary" ? styles.primary : styles.secondary}
        {...props}
    >
        <Text style={styles.label}>{label}</Text>
    </Pressable>
);

const styles = StyleSheet.create({
    primary: { backgroundColor: "#3366FF", padding: 12, borderRadius: 8 },
    secondary: { backgroundColor: "#E5E7EB", padding: 12, borderRadius: 8 },
    label: { color: "#FFFFFF", fontWeight: "600" },
});
