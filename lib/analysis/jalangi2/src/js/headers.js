/*
 * Copyright (c) 2014 Samsung Electronics Co., Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// do not remove the following comment
// JALANGI DO NOT INSTRUMENT
var path = require('path');
module.exports.headerSources = [
    path.join(__dirname, "./Constants.js"),
    path.join(__dirname, "./Config.js"),
    path.join(__dirname, "./instrument/astUtil.js"),
    path.join(__dirname, "./instrument/esnstrument.js"),
    path.join(__dirname, "./runtime/iidToLocation.js"),
    path.join(__dirname, "./runtime/analysis.js")
];
