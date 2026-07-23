"""
Tokinarc — apps/catalog/product_groups.py

Quản lý Nhóm sản phẩm → Danh mục → gắn sản phẩm (phân cấp mềm, do Quản lý kho
tự tạo/sửa/xoá qua giao diện). Tách khỏi views.py cho gọn.

  GET/POST         /api/v1/catalog/product-groups/            — list/tạo Nhóm
  PATCH/DELETE     /api/v1/catalog/product-groups/{id}/       — sửa/xoá Nhóm
  GET/POST         /api/v1/catalog/product-categories/        — list/tạo Danh mục
  PATCH/DELETE     /api/v1/catalog/product-categories/{id}/   — sửa/xoá Danh mục
  POST             /api/v1/catalog/product-categories/{id}/assign/    — gắn SP vào Danh mục
  POST             /api/v1/catalog/product-categories/unassign/       — bỏ gắn (về chưa phân loại)

Quyền: ĐỌC cho mọi nhân viên (để giao diện hiển thị); GHI (tạo/sửa/xoá/gắn) chỉ
Quản lý kho trở lên (wh_manager/manager/ceo) — đúng "Quản lý kho tạo Nhóm".
Chống xoá khi còn con: Nhóm còn Danh mục / Danh mục còn sản phẩm → chặn 409,
buộc dọn/di chuyển trước (tránh mất phân loại ngoài ý muốn).
"""
from __future__ import annotations

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from apps.accounts.roles import Role, WMS_CONTROL_ROLES, role_of

from .models import Part, ProductCategory, ProductGroup


class ProductTaxonomyPermission(BasePermission):
    message = "Chỉ Quản lý kho trở lên được tạo/sửa/xoá Nhóm & Danh mục."

    def has_permission(self, request, view) -> bool:
        u = request.user
        if not (u and u.is_authenticated) or role_of(u) == Role.CUSTOMER:
            return False
        if request.method in SAFE_METHODS:
            return True
        return role_of(u) in WMS_CONTROL_ROLES


class ProductCategorySerializer(serializers.ModelSerializer):
    part_count = serializers.IntegerField(source='parts.count', read_only=True)
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = ProductCategory
        fields = ['id', 'group', 'group_name', 'name', 'sort_order', 'part_count']


class ProductGroupSerializer(serializers.ModelSerializer):
    categories     = ProductCategorySerializer(many=True, read_only=True)
    category_count = serializers.IntegerField(source='categories.count', read_only=True)
    part_count     = serializers.SerializerMethodField()

    class Meta:
        model = ProductGroup
        fields = ['id', 'name', 'sort_order', 'category_count', 'part_count', 'categories']

    def get_part_count(self, obj: ProductGroup) -> int:
        return Part.objects.filter(product_category__group=obj).count()


class ProductGroupViewSet(viewsets.ModelViewSet):
    serializer_class   = ProductGroupSerializer
    permission_classes = [ProductTaxonomyPermission]
    queryset = ProductGroup.objects.prefetch_related('categories').all()

    def destroy(self, request, *args, **kwargs):
        group = self.get_object()
        if group.categories.exists():
            return Response(
                {'detail': f'Nhóm "{group.name}" còn danh mục bên trong — '
                           'xoá/di chuyển hết danh mục trước khi xoá nhóm.',
                 'code': 'GROUP_HAS_CATEGORIES'}, status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)


class ProductCategoryViewSet(viewsets.ModelViewSet):
    serializer_class   = ProductCategorySerializer
    permission_classes = [ProductTaxonomyPermission]

    def get_queryset(self):
        qs = ProductCategory.objects.select_related('group')
        group = self.request.query_params.get('group')
        if group:
            qs = qs.filter(group_id=group)
        return qs

    def destroy(self, request, *args, **kwargs):
        cat = self.get_object()
        n = cat.parts.count()
        if n:
            return Response(
                {'detail': f'Danh mục "{cat.name}" còn {n} sản phẩm — '
                           'di chuyển/bỏ gắn sản phẩm trước khi xoá danh mục.',
                 'code': 'CATEGORY_HAS_PARTS'}, status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        """Gắn danh sách sản phẩm (part_nos) vào Danh mục này."""
        cat = self.get_object()
        part_nos = request.data.get('part_nos') or []
        if not isinstance(part_nos, list) or not part_nos:
            return Response({'detail': 'Thiếu danh sách part_nos.'}, status=400)
        updated = Part.objects.filter(tokin_part_no__in=part_nos).update(product_category=cat)
        return Response({'assigned': updated, 'category': cat.name, 'group': cat.group.name})

    @action(detail=False, methods=['post'])
    def unassign(self, request):
        """Bỏ gắn danh sách sản phẩm khỏi mọi Danh mục (về chưa phân loại)."""
        part_nos = request.data.get('part_nos') or []
        if not isinstance(part_nos, list) or not part_nos:
            return Response({'detail': 'Thiếu danh sách part_nos.'}, status=400)
        updated = Part.objects.filter(tokin_part_no__in=part_nos).update(product_category=None)
        return Response({'unassigned': updated})
