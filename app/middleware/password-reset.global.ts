import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) {
    return;
  }

  const authStore = useAuthStore();
  const { requiresPasswordReset, isAuthenticated } = storeToRefs(authStore);

  if (!isAuthenticated.value || !requiresPasswordReset.value) {
    return;
  }

  const redirectPath = to.fullPath;

  if (
    typeof to.query.redirect === 'string' &&
    to.query.redirect.startsWith('/auth/password/force')
  ) {
    return abortNavigation();
  }

  if (to.path === '/auth/password/force') {
    return;
  }

  return navigateTo({
    path: '/auth/password/force',
    query: {
      redirect: redirectPath,
    },
  });
});
