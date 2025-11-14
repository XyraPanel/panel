// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    'vue/first-attribute-linebreak': 'off',
    'vue/html-indent': 'off',
    // 'prettier/prettier': ['error', { vueIndentScriptAndStyle: false }]
  }
})
