import nextra from 'nextra'

const withNextra = nextra({
  search: true,       // Enable built-in FlexSearch
  staticImage: true,
  defaultShowCopyCode: true,
})

export default withNextra({
  reactStrictMode: true,
})
