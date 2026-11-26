import webpack from "webpack";

export default (env, argv) => ({
  mode: argv.mode || "production",
  devtool: argv.mode === "development" ? "inline-source-map" : false,
  entry: "./src/stack-in-card.ts",
  output: {
    filename: "stack-in-card.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  plugins: [
    // The release workflow sets CARD_VERSION to the tag being released
    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(process.env.CARD_VERSION || "dev"),
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
});
