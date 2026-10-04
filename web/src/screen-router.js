import { renderPublic, publicAction, publicSubmit } from './public.js';
import { renderAdmin, adminAction, adminSubmit } from './admin.js';
import { renderMerchant, merchantAction, merchantSubmit } from './partner-stamps.js';

export const isAdminScreen = (path = location.pathname) => path === '/admin' || path.startsWith('/admin/');
export const isMerchantScreen = (path = location.pathname) => path.replace(/\/+$/,'') === '/partners/feelingfine';
export const renderScreen = ctx => isAdminScreen() ? renderAdmin(ctx) : isMerchantScreen() ? renderMerchant(ctx) : renderPublic(ctx);
export const screenAction = (ctx, action, id, target) => isAdminScreen() ? adminAction(ctx, action, id, target) : isMerchantScreen() ? merchantAction(ctx, action, id, target) : publicAction(ctx, action, id, target);
export const screenSubmit = (ctx, form, data, node) => isAdminScreen() ? adminSubmit(ctx, form, data, node) : isMerchantScreen() ? merchantSubmit(ctx, form, data, node) : publicSubmit(ctx, form, data, node);
