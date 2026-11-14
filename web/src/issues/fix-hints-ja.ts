export const FIX_HINT_TEXTS_JA: Record<string, string> = {
  "hint.normal.flipped.meaning":
    "頂点法線が、三角形の頂点の並び順（巻き順）とは逆を向いています。そのため、陰影と裏面の非表示処理が食い違います。",
  "hint.normal.flipped.why":
    "エンジンは巻き順で裏面を判定し、法線で明るさを計算します。両者が食い違うと、モデルの一部が裏返ったように見えたり、暗くなったり、片側から見えなくなったりします。",
  "hint.normal.flipped.fix":
    "面の向きを外側にそろえ、負のスケールを適用してから再エクスポートしてください。面の向きや裏面を表示する機能で結果を確認してください。",
  "hint.normal.flipped.tool.blender":
    "Face Orientation オーバーレイを有効にします（赤い面は逆向きです）。Edit Mode で面を選び、Mesh > Normals > Recalculate Outside (Shift+N) または Mesh > Normals > Flip を使ってください。Object > Apply > Scale でスケールを適用します。",
  "hint.normal.flipped.tool.maya":
    "面を選び、Mesh Display > Reverse を使ってください。シェル内の法線をそろえるには Mesh Display > Conform を使います。",
  "hint.normal.flipped.tool.max":
    "Normal modifier を追加して Unify normals を有効にします（全体が裏返っている場合は Flip normals も有効にします）。または Edit Poly で選択したポリゴンに Flip を使ってください。",
  "hint.normal.missing.meaning": "このプリミティブには頂点法線がありません。",
  "hint.normal.missing.why":
    "法線がないとビューアーが陰影を推定するため、モデルが平坦に見えたり、面の境目が目立ったりします。ノーマルマップも正しく機能しないことがあります。",
  "hint.normal.missing.fix":
    "法線を含めてエクスポートしてください。滑らかな陰影にする場合は、エクスポート前にメッシュの法線が滑らかにつながっていることを確認してください。",
  "hint.normal.missing.tool.blender":
    "glTF のエクスポート設定で、Data > Mesh の Normals を有効にしてください。",
  "hint.normal.missing.tool.unreal":
    "インポート時にエンジンで法線を計算できます（FBX のインポート設定の Normal Import Method > Compute Normals）。",
  "hint.normal.unnormalized.meaning": "頂点法線の長さが 1 ではなく、正規化されていません。",
  "hint.normal.unnormalized.why":
    "照明やノーマルマップは長さが 1 の法線を前提とします。それ以外の長さでは、陰影が明るすぎたり暗すぎたりします。",
  "hint.normal.unnormalized.fix":
    "法線を正規化してください。未適用のスケールや不均一なスケールを解消し、手動編集したカスタム法線を元に戻してから再エクスポートしてください。",
  "hint.normal.unnormalized.tool.blender":
    "エクスポート前に Object > Apply > Scale でオブジェクトのスケールを適用してください。",
  "hint.mesh.nonmanifold_edge.meaning":
    "1 本のエッジを 3 面以上の三角形が共有しています。表面から突き出したひれ状の面や、内部の壁などが該当します。",
  "hint.mesh.nonmanifold_edge.why":
    "非多様体の形状は、スムージング、UV 展開、物理演算、3D プリントに問題を起こし、多くのツールで処理できません。",
  "hint.mesh.nonmanifold_edge.fix":
    "余分な面や二重になった形状を探して削除または分離し、重複する頂点を結合してください。",
  "hint.mesh.nonmanifold_edge.tool.blender":
    "頂点またはエッジ選択モードで Select > Select All by Trait > Non Manifold を使い、Multiple Faces を有効にします。余分な面を削除または分離し、重複する頂点には Merge by Distance を使ってください。",
  "hint.mesh.nonmanifold_edge.tool.maya":
    "Mesh > Cleanup で非多様体の形状を対象とするオプションを有効にしてください。",
  "hint.mesh.nonmanifold_edge.tool.houdini":
    "Fuse SOP で同じ位置のポイントを結合し、余分なプリミティブを削除してください。",
  "hint.mesh.boundary_edge.meaning":
    "1 本のエッジが 1 面の三角形だけに使われており、穴の縁や開いた境界になっています。平面、布、葉では意図した形状ですが、閉じた立体では欠陥です。",
  "hint.mesh.boundary_edge.why":
    "閉じた立体に穴があると内部が見え、照明やベイクに問題が生じます。意図して開いた表面であれば問題ありません。",
  "hint.mesh.boundary_edge.fix":
    "閉じたモデルにする場合は、穴を埋めるか縫い合わせ、継ぎ目で重複している頂点を結合してください。",
  "hint.mesh.boundary_edge.tool.blender":
    "Select > Select All by Trait > Non Manifold で Boundaries を有効にして穴を確認します。Mesh > Clean Up > Fill Holes（大きな穴には Face Fill または Grid Fill）を使い、継ぎ目には Merge by Distance を使ってください。",
  "hint.mesh.boundary_edge.tool.maya": "穴の縁のエッジを選び、Mesh > Fill Hole を使ってください。",
  "hint.mesh.boundary_edge.tool.max":
    "Cap Holes modifier を使うか、Edit Poly で境界をふさいでください。",
  "hint.mesh.boundary_edge.tool.houdini": "PolyFill SOP で穴をポリゴンで埋めてください。",
  "hint.mesh.degenerate_triangle.meaning":
    "三角形の面積がほぼありません（頂点が一直線上や同じ位置にあります）。または、頂点の位置に有効でない数値が含まれています。",
  "hint.mesh.degenerate_triangle.why":
    "陰影や法線を正しく計算できず、不正な数値、ちらつき、ベイクや物理演算のエラーの原因になります。",
  "hint.mesh.degenerate_triangle.fix":
    "面積がない三角形を削除または縮約し、縮約先で重なるポイントを結合してください。",
  "hint.mesh.degenerate_triangle.tool.blender":
    "Mesh > Clean Up > Degenerate Dissolve を使ってください。結合距離より短いエッジを縮約します。",
  "hint.mesh.degenerate_triangle.tool.maya":
    "Mesh > Cleanup で面積がゼロの面を対象とするオプションを有効にしてください。",
  "hint.mesh.degenerate_triangle.tool.houdini":
    "Clean SOP の Remove Degenerate Primitives、または Fuse SOP の Remove Repeated Vertices と Degenerate Primitives を使ってください。",
  "hint.mesh.degenerate_triangle.tool.unreal":
    "FBX のインポート設定で Remove Degenerates を有効にしておいてください。",
  "hint.uv.missing.meaning": "このプリミティブには UV 座標がありません。",
  "hint.uv.missing.why":
    "UV がないとテクスチャを貼れません。頂点カラーや単色のマテリアルだけを使うモデルでは不要です。",
  "hint.uv.missing.fix":
    "モデルを UV 展開し、UV を含めてエクスポートしてください。テクスチャを使わないモデルであれば、この指摘は無視できます。",
  "hint.uv.missing.tool.blender":
    "Edit Mode で UV > Unwrap (U) を使います（例: Smart UV Project）。glTF のエクスポート設定の Data > Mesh で UVs を有効にしてください。",
  "hint.uv.missing.tool.houdini":
    "UV Auto Seam SOP と UV Flatten SOP（または UV Unwrap SOP）を使い、UV Layout SOP でアイランドを配置してください。",
  "hint.uv.out_of_range.meaning":
    "一部の UV 座標が、テクスチャの 0〜1 の正方形の範囲外にあります。",
  "hint.uv.out_of_range.why":
    "繰り返すテクスチャでは意図した配置の場合があります。それ以外ではテクスチャが繰り返されたり切れたりし、アトラスやベイクしたテクスチャで別の画素が表示されます。",
  "hint.uv.out_of_range.fix":
    "テクスチャを繰り返さない場合は、UV アイランドを拡大縮小・移動して 0〜1 の正方形に収めてください。",
  "hint.uv.out_of_range.tool.blender":
    "UV Editor ですべてを選んでアイランドを拡大縮小するか、UV > Pack Islands で正方形に収めてください。",
  "hint.uv.out_of_range.tool.houdini":
    "UV Layout SOP でアイランドを 0〜1 の範囲に配置してください。",
  "hint.uv.overlap.meaning":
    "複数の三角形がテクスチャの同じ部分を覆っています。同じ向きの重なりはエラーです。鏡像配置（左右の半分で同じ領域を共有する場合など）は警告です。",
  "hint.uv.overlap.why":
    "重なったアイランドは画素を共有するため、ベイクした照明や描き込んだ模様が別の部分にも現れます。鏡像配置は、テクスチャ領域を節約する一般的で意図的な方法です。",
  "hint.uv.overlap.fix":
    "各部分に専用の領域ができるようアイランドを分離して配置してください。鏡像配置は、対称なモデルで意図して使う場合だけ残してください。",
  "hint.uv.overlap.tool.blender":
    "UV Editor で重なったアイランドを離してから、UV > Pack Islands を使ってください。",
  "hint.uv.overlap.tool.houdini": "UV Layout SOP でアイランドが重ならないように配置してください。",
  "hint.asset.triangle_count_exceeded.meaning":
    "シーンで描画する三角形の数が上限（既定で 100,000 個）を超えています。メッシュの配置ごとに数えます。",
  "hint.asset.triangle_count_exceeded.why":
    "三角形が多いとメモリ使用量と描画時間が増えます。特にブラウザーやスマートフォンでは負担になります。",
  "hint.asset.triangle_count_exceeded.fix":
    "三角形を減らし、見えない形状を削除して、詳細度を切り替える仕組みを使ってください。プロジェクトで許容できる数であれば、「設定」で上限を上げてください。",
  "hint.asset.triangle_count_exceeded.tool.blender":
    "Decimate modifier を追加し、Ratio を下げてから適用してください。",
  "hint.asset.triangle_count_exceeded.tool.maya":
    "Mesh > Reduce を使い、Percentage を設定してください。",
  "hint.asset.triangle_count_exceeded.tool.max":
    "ProOptimizer modifier を追加し、Vertex % の値を下げてください。",
  "hint.asset.triangle_count_exceeded.tool.unreal":
    "Static Mesh Editor で詳細度ごとの削減設定（Percent Triangles）を調整してください。",
  "hint.asset.scale_too_small.meaning":
    "モデルの外接箱の最長辺が、最小値（既定で 0.01 m）より短くなっています。",
  "hint.asset.scale_too_small.why":
    "glTF の単位はメートルです。単位の変換が二重にかかった場合や、意図より小さい寸法でモデルを作った場合に、エンジン内で 100 倍または 1000 倍小さく表示されることがあります。",
  "hint.asset.scale_too_small.fix":
    "シーンの単位とエクスポート時のスケールを確認し、1 単位を 1 メートルにして、オブジェクトのスケールを適用してからエクスポートしてください。サイズが正しければ、「設定」のしきい値を変更してください。",
  "hint.asset.scale_too_small.tool.blender":
    "Scene > Units を Metric、Unit Scale 1.0 に設定し、Object > Apply > Scale でスケールを適用してください。",
  "hint.asset.scale_too_small.tool.maya":
    "Maya の既定の単位はセンチメートルです。Preferences > Settings > Working Units とエクスポーターが書き出す単位を照合してください。",
  "hint.asset.scale_too_small.tool.max":
    "Customize > Units Setup と、その中のシステム単位を確認してください。",
  "hint.asset.scale_too_large.meaning":
    "モデルの外接箱の最長辺が、最大値（既定で 1000 m）より長くなっています。",
  "hint.asset.scale_too_large.why":
    "glTF の単位はメートルです。センチメートルやミリメートルの数値を変換せずに書き出すと、エンジン内で 100 倍または 1000 倍大きく表示されることがあります。",
  "hint.asset.scale_too_large.fix":
    "シーンの単位とエクスポート時のスケールを確認し、1 単位を 1 メートルにして、オブジェクトのスケールを適用してからエクスポートしてください。サイズが正しければ、「設定」のしきい値を変更してください。",
  "hint.asset.scale_too_large.tool.blender":
    "Scene > Units を Metric、Unit Scale 1.0 に設定し、Object > Apply > Scale でスケールを適用してください。",
  "hint.asset.scale_too_large.tool.maya":
    "Maya の既定の単位はセンチメートルです。Preferences > Settings > Working Units とエクスポーターが書き出す単位を照合してください。",
  "hint.asset.scale_too_large.tool.max":
    "Customize > Units Setup と、その中のシステム単位を確認してください。",
  "hint.asset.external_uri.meaning":
    "ファイルに外部の画像（Web アドレスやファイルパス）が記載されています。このツールはそれらを開きません。",
  "hint.asset.external_uri.why":
    "ビューアーやエンジンは外部画像を読み込もうとする場合があります。画像が見つからないことがあり、Web アドレスではモデルを開いた際に通信が発生する可能性があります。",
  "hint.asset.external_uri.fix":
    "テクスチャを含む単一の .glb ファイルとしてエクスポートし、外部ファイルに依存しないようにしてください。",
  "hint.asset.external_uri.tool.blender":
    "Format: glTF Binary (.glb) でエクスポートしてください。画像がファイル内に格納されます。",
};
