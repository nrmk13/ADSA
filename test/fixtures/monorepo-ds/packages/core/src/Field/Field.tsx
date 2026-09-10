export function Field({ label, ...props }) {
    return (
        <label>
            {label}
            <input {...props} />
        </label>
    );
}
