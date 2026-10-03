import { renderPublic, publicAction, publicSubmit } from './public.js';
import { renderAdmin, adminAction, adminSubmit } from './admin.js';

export const isAdminScreen = (path = location.pathname) => path === '/admin' || path.startsWith('/admin/');
export const renderScreen = ctx => isAdminScreen() ? renderAdmin(ctx) : renderPublic(ctx);
export const screenAction = (ctx, action, id, target) => isAdminScreen() ? adminAction(ctx, action, id, target) : publicAction(ctx, action, id, target);
export const screenSubmit = (ctx, form, data, node) => isAdminScreen() ? adminSubmit(ctx, form, data, node) : publicSubmit(ctx, form, data, node);
