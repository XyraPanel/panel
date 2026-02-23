export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/account') {
    return;
  }

  return navigateTo('/account/profile', { replace: true });
});
