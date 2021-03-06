# Copyright © 2019 Province of British Columbia
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""This manages a Product Code record.

It defines the available products.
"""

from sqlalchemy import Column, ForeignKey

from .base_model import BaseCodeModel


class ProductCode(BaseCodeModel):  # pylint: disable=too-few-public-methods
    """Product code table to store all the products supported by auth system."""

    __tablename__ = 'product_code'
    type_code = Column(ForeignKey('product_type_code.code'), default='INTERNAL', nullable=False)

    @classmethod
    def find_by_code(cls, code):
        """Find a Product Role Code instance that matches the code."""
        return cls.query.filter_by(code=code).one_or_none()

    @classmethod
    def get_all_products(cls):
        """Get all of the products codes."""
        return cls.query.all()
