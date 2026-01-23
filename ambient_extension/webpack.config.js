const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      background: './src/background/background.ts',
      content: './src/content/content.ts',
      sidepanel: './src/sidepanel/sidepanel.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: isProduction,  // Remove console.* in production
            },
          },
        }),
      ],
    },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/sidepanel/index.html', to: 'sidepanel.html' },
        { from: 'src/sidepanel/styles.css', to: 'styles.css' },
        { 
          from: 'src/icons', 
          to: 'icons',
          noErrorOnMissing: true 
        },
      ],
    }),
  ],
  devtool: isProduction ? false : 'cheap-module-source-map',
  };
};
