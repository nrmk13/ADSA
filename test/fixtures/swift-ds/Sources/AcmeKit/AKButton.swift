import SwiftUI

public enum AKButtonStyle {
    case primary
    case secondary
}

public struct AKButton: View {
    public let title: String
    public var style: AKButtonStyle

    public init(title: String, style: AKButtonStyle = .primary) {
        self.title = title
        self.style = style
    }

    public var body: some View {
        Text(title)
            .padding()
            .background(style == .primary ? Color(red: 0.2, green: 0.4, blue: 1.0) : Color(.systemGray5))
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isButton)
    }
}
