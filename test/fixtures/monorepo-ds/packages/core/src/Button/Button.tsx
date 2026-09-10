export function Button({ tone = "neutral", ...props }) {
    return <button data-tone={tone} {...props} />;
}
