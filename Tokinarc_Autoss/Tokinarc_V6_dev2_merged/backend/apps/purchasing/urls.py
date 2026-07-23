"""Tokinarc — apps/purchasing/urls.py"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .imports import SupplierImportTemplateView, SupplierImportView
from .views import (
    PurchaseOrderViewSet, PurchasePaymentViewSet, SupplierViewSet,
)

router = DefaultRouter()
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'payments', PurchasePaymentViewSet, basename='purchasepayment')

urlpatterns = [
    # Import Excel NCC — đặt TRƯỚC router để không bị route <pk> của suppliers nuốt.
    path('suppliers/import/', SupplierImportView.as_view(), name='supplier-import'),
    path('suppliers/import-template/', SupplierImportTemplateView.as_view(), name='supplier-import-template'),
] + router.urls
