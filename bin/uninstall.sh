#!/usr/bin/env sh

# SPDX-FileCopyrightText: 2021 Mikhail Zolotukhin <mail@genda.life>
# SPDX-FileCopyrightText: 2018-2019 Eon S. Jeon <esjeon@hyunmu.am>
# 
# SPDX-License-Identifier: MIT

set -e

plasmapkg2 -t kwinscript -r $npm_package_name
