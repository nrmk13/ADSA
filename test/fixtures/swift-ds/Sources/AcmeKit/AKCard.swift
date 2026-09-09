import SwiftUI

public struct AKCard<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content
            .padding()
            .background(Color(.secondarySystemBackground))
            .cornerRadius(12)
    }
}
