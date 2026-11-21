<template>
  <div class="app-container">
    <el-form ref="formRef" :model="formData" :rules="rules" size="default" label-width="100px">
      <el-form-item label="级联选择" prop="field101">
        <el-cascader v-model="formData.field101" :options="field101Options" :props="field101Props"
          :style="{width: '100%'}" placeholder="请选择级联选择" clearable></el-cascader>
      </el-form-item>
      <el-form-item label="单选框组" prop="field102">
        <el-radio-group v-model="formData.field102" size="default">
          <el-radio v-for="(item, index) in field102Options" :key="index" :value="item.value"
            :disabled="item.disabled">{{item.label}}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="多选框组" prop="field103">
        <el-checkbox-group v-model="formData.field103" size="default">
          <el-checkbox v-for="(item, index) in field103Options" :key="index" :value="item.value"
            :disabled="item.disabled">{{item.label}}</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item label="开关" prop="field104" required>
        <el-switch v-model="formData.field104"></el-switch>
      </el-form-item>
      <el-form-item label="滑块" prop="field105" required>
        <el-slider :min='0' :max='100' :step='1' v-model="formData.field105"></el-slider>
      </el-form-item>
      <el-form-item label="评分" prop="field106">
        <el-rate v-model="formData.field106" :max='5' show-score></el-rate>
      </el-form-item>
      <el-form-item label="颜色选择" prop="field107" required>
        <el-color-picker v-model="formData.field107" size="default"></el-color-picker>
      </el-form-item>
      <el-form-item label="上传" prop="field108" required>
        <el-upload ref="field108Ref" v-model:file-list="field108fileList" :action="field108Action"
          :auto-upload="false" :before-upload="field108BeforeUpload" accept=".txt">
          <el-button size="small" type="primary" icon="Upload">选择测试文件</el-button>
          <template #tip>
            <div class="el-upload__tip">只能上传不超过 2MB 的.txt文件</div>
          </template>
        </el-upload>
      </el-form-item>
      <el-form-item label="计数器" prop="field109">
        <el-input-number v-model="formData.field109" placeholder="计数器" :disabled='true'></el-input-number>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="submitForm">提交</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
<script setup>
const {
  proxy
} = getCurrentInstance()
const formRef = ref()
const data = reactive({
  formData: {
    field101: [1, 2],
    field102: 2,
    field103: [1, 2],
    field104: true,
    field105: 1,
    field106: 4,
    field107: "#ff0000",
    field108: null,
    field109: 1,
  },
  rules: {
    field101: [{
      required: true,
      type: 'array',
      message: "请至少选择一个field101",
      trigger: 'change'
    }],
    field102: [{
      required: true,
      message: "单选框组不能为空",
      trigger: 'change'
    }],
    field103: [{
      required: true,
      type: 'array',
      message: "请至少选择一个field103",
      trigger: 'change'
    }],
    field106: [{
      required: true,
      message: "评分不能为空",
      trigger: 'change'
    }],
    field109: [{
      required: true,
      message: "计数器",
      trigger: 'blur'
    }],
  }
})
const {
  formData,
  rules
} = toRefs(data)
const field101Options = ref([{
  "id": 1,
  "value": 1,
  "label": "选项1",
  "children": [{
    "id": 2,
    "value": 2,
    "label": "选项1-1"
  }]
}])
const field102Options = ref([{
  "label": "选项一",
  "value": 1
}, {
  "label": "选项二",
  "value": 2
}])
const field103Options = ref([{
  "label": "选项一",
  "value": 1
}, {
  "label": "选项二",
  "value": 2
}])
// 上传请求路径
const field108Action = ref("/qa-upload-preview")
// 上传组件实例
const field108Ref = ref()
// 上传文件列表
const field108fileList = ref([])
// props设置
const field101Props = ref({
  "multiple": false
})

function getField101Options() {
  // TODO 接入业务接口后替换 field101Options.value；初始保留设计器选项。
  return field101Options.value
}

function field108BeforeUpload(file) {
  const isRightSize = file.size / 1024 / 1024 <= 2
  if (!isRightSize) proxy.$modal.msgError("文件大小超过 2MB")
  const acceptedTypes = ".txt".toLowerCase().split(',').map(type => type.trim()).filter(Boolean)
  const fileName = String(file.name || '').toLowerCase()
  const mimeType = String(file.type || '').toLowerCase()
  const isAccept = acceptedTypes.some(type => type.startsWith('.') ? fileName.endsWith(type) : type.endsWith(
    '/*') ? mimeType.startsWith(type.slice(0, -1)) : mimeType === type)
  if (!isAccept) proxy.$modal.msgError("应该选择.txt类型的文件")
  return isRightSize && isAccept
}

function field108SubmitUpload() {
  field108Ref.value?.submit()
}
/**
 * @name: 表单提交
 * @description: 表单提交方法
 * @return {*}
 */
function submitForm() {
  formRef.value.validate((valid) => {
    if (!valid) return
    // TODO 提交表单
  })
}
/**
 * @name: 表单重置
 * @description: 表单重置方法
 * @return {*}
 */
function resetForm() {
  formRef.value.resetFields()
}

</script>
<style>
.el-rate {
  display: inline-block;
  vertical-align: text-top;
}

.el-upload__tip {
  line-height: 1.2;
}

</style>
