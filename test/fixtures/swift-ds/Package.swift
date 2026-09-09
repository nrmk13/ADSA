// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AcmeKit",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "AcmeKit", targets: ["AcmeKit"])
    ],
    targets: [
        .target(name: "AcmeKit")
    ]
)
